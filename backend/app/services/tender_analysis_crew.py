import json
import os
import re
from dataclasses import dataclass
from typing import Any

from crewai import Agent, Crew, LLM, Process, Task
from json_repair import repair_json
from pydantic import BaseModel, Field

from app.config import settings


def _json_block(value: Any, *, max_chars: int) -> str:
    raw = json.dumps(value, ensure_ascii=False, indent=2)
    if len(raw) <= max_chars:
        return raw
    return raw[:max_chars] + "\n...<truncated>"


class StageEnvelope(BaseModel):
    summary: str
    preview_json: str = Field(default="{}")
    data_json: str = Field(default="{}")


@dataclass(frozen=True)
class StageExecutionResult:
    summary: str
    preview: dict[str, Any]
    data: dict[str, Any]


STAGE_SPECS: dict[str, dict[str, str]] = {
    "inventory": {
        "agent_key": "inventory_agent",
        "title": "Document Inventory",
        "goal": "建立招标文件的目录、关键章节、表格和信息分布地图。",
        "backstory": "你擅长快速读懂复杂招标文档结构，并输出后续提取可直接消费的结构化文档地图。",
        "extra_rules": """
- 输出 `document_meta`。
- `document_meta` 中可以包含 `outline_summary`、`key_sections`、`key_tables`、`language` 等补充信息。
- `preview` 中优先放 `key_sections`、`table_count`、`suspicious_sections`。
""",
    },
    "core_facts": {
        "agent_key": "facts_agent",
        "title": "Core Facts",
        "goal": "提取项目概况、预算、主体、标段、联系人和核心商务信息。",
        "backstory": "你擅长从招标文件正文和表格中抽取项目关键事实，并为每个事实附上证据与状态。",
        "extra_rules": """
- 仅输出 `project_overview`、`lots`、`contacts`、`commercial_terms`。
- 标量字段一律使用 `{value,status,confidence,evidence,candidate_values}` 包装。
- `contacts`、`lots` 里的重要字段也尽量使用同样的 field 包装。
- 如果预算、最高限价、保证金在多处冲突，保留 `candidate_values` 并把 `status` 置为 `conflicting`。
- 每条证据尽量同时提供 `source_excerpt`、`matched_text`、`source_section_path` 和 `confidence`，不要只给一个模糊的 `excerpt`。
""",
    },
    "timeline": {
        "agent_key": "timeline_agent",
        "title": "Timeline Extraction",
        "goal": "提取全部时间线节点、识别冲突并生成待办候选。",
        "backstory": "你专门处理招标文件中的时间约束、截止时间、开标节点和依赖顺序异常。",
        "extra_rules": """
- 仅输出 `timeline` 和 `deadline_todos`。
- `timeline` 必须包含 `nodes` 和 `conflicts`。
- 每个 node 至少包含 `id,event_type,label,date,time,datetime_iso,lots,status,confidence,urgency,is_critical,dependencies,candidate_values,evidence,user_note`。
- `conflicts` 用于记录时间冲突、缺少具体时分、前后顺序异常等。
- `deadline_todos` 是从关键节点推导出的准备事项候选。
- `evidence` 尽量同时提供 `source_excerpt`、`matched_text`、`source_section_path` 和 `confidence`。
""",
    },
    "requirements": {
        "agent_key": "requirements_agent",
        "title": "Requirements Extraction",
        "goal": "提取资格条件、商务要求、技术范围和投标文件要求。",
        "backstory": "你擅长把冗长条款归类为可执行清单，特别关注投标资格、技术边界和提交要求。",
        "extra_rules": """
- 仅输出 `qualification_requirements`、`technical_scope`、`submission_requirements`。
- `technical_scope.summary` 使用 field 包装。
- 清单项尽量包含 `title`、`description`、`status`、`confidence`、`evidence`、`category`。
- 对模糊或缺失要求，显式标记 `missing` 或 `inferred`。
- 如果提供证据，请同时给出 `source_excerpt`、`matched_text`、`source_section_path`。
""",
    },
    "risk_review": {
        "agent_key": "risk_agent",
        "title": "Conflict & Risk Review",
        "goal": "汇总评标办法、合规红线、冲突条款、缺失项与开放问题。",
        "backstory": "你负责做最后的质量复核，识别高风险条款、否决项、评分细则和需要人工确认的问题。",
        "extra_rules": """
- 仅输出 `evaluation_criteria`、`compliance_flags`、`risk_register`、`open_questions`。
- `risk_register` 中每个风险项尽量包含 `id,title,severity,summary,status,evidence,recommendation`。
- `open_questions` 中每个问题尽量包含 `id,question,status,evidence,reason`。
- 需要同时关注时间、资格、商务、评分、提交要求中的冲突或空缺。
- `evidence` 尽量同时提供 `source_excerpt`、`matched_text`、`source_section_path`。
""",
    },
}


def build_tender_analysis_llm() -> LLM:
    if not settings.litellm_api_key:
        raise ValueError("未配置 LITELLM_API_KEY，无法启动 CrewAI 招标提取团队。")

    _apply_openai_compatible_env()

    kwargs: dict[str, Any] = {"api_key": settings.litellm_api_key}
    if settings.litellm_api_base:
        kwargs["base_url"] = settings.litellm_api_base

    return LLM(model=settings.litellm_model, **kwargs)


def _apply_openai_compatible_env() -> None:
    # CrewAI 1.11.0 的部分执行路径会绕过显式传入的 LLM 凭证，直接走裸 litellm/openai 客户端。
    # 这里把现有 OpenAI-compatible 配置同步到标准环境变量，避免任务执行时再次丢失 api_key/base_url。
    os.environ["OPENAI_API_KEY"] = settings.litellm_api_key
    if settings.litellm_api_base:
        os.environ["OPENAI_BASE_URL"] = settings.litellm_api_base
        os.environ["OPENAI_API_BASE"] = settings.litellm_api_base


class TenderAnalysisCrewRunner:
    def __init__(self, llm: LLM | None = None) -> None:
        self.llm = llm or build_tender_analysis_llm()
        self.agents = {
            "inventory_agent": Agent(
                role="招标文档结构分析师",
                goal=STAGE_SPECS["inventory"]["goal"],
                backstory=STAGE_SPECS["inventory"]["backstory"],
                llm=self.llm,
                verbose=settings.crewai_verbose,
                allow_delegation=False,
                max_iter=8,
            ),
            "facts_agent": Agent(
                role="招标核心事实提取师",
                goal=STAGE_SPECS["core_facts"]["goal"],
                backstory=STAGE_SPECS["core_facts"]["backstory"],
                llm=self.llm,
                verbose=settings.crewai_verbose,
                allow_delegation=False,
                max_iter=8,
            ),
            "timeline_agent": Agent(
                role="招标时间线分析师",
                goal=STAGE_SPECS["timeline"]["goal"],
                backstory=STAGE_SPECS["timeline"]["backstory"],
                llm=self.llm,
                verbose=settings.crewai_verbose,
                allow_delegation=False,
                max_iter=8,
            ),
            "requirements_agent": Agent(
                role="招标条款归纳师",
                goal=STAGE_SPECS["requirements"]["goal"],
                backstory=STAGE_SPECS["requirements"]["backstory"],
                llm=self.llm,
                verbose=settings.crewai_verbose,
                allow_delegation=False,
                max_iter=8,
            ),
            "risk_agent": Agent(
                role="招标风险审查师",
                goal=STAGE_SPECS["risk_review"]["goal"],
                backstory=STAGE_SPECS["risk_review"]["backstory"],
                llm=self.llm,
                verbose=settings.crewai_verbose,
                allow_delegation=False,
                max_iter=8,
            ),
        }

    def build_stage_crew(
        self,
        *,
        stage: str,
        document_name: str,
        context: dict[str, Any],
        previous_results: dict[str, Any],
        snapshot: dict[str, Any],
    ) -> tuple[Crew, Task]:
        spec = STAGE_SPECS.get(stage)
        if spec is None:
            raise ValueError(f"Unsupported tender analysis stage: {stage}")

        task = Task(
            name=stage,
            description=self._build_task_description(
                stage=stage,
                document_name=document_name,
                context=context,
                previous_results=previous_results,
                snapshot=snapshot,
            ),
            expected_output=(
                "输出一个 JSON 对象，严格匹配 schema: "
                '{"summary": string, "preview_json": string, "data_json": string}。'
                "其中 `preview_json` 和 `data_json` 必须是合法 JSON 字符串。"
                "不要输出 markdown，不要输出代码块，不要输出 schema 之外的文本。"
                "证据字段优先使用 `source_excerpt`、`matched_text`、`source_section_path`。"
            ),
            agent=self.agents[spec["agent_key"]],
        )
        crew = Crew(
            name=f"tender-analysis-{stage}",
            agents=list(self.agents.values()),
            tasks=[task],
            process=Process.sequential,
            verbose=settings.crewai_verbose,
            planning=False,
            memory=False,
        )
        return crew, task

    async def run_stage(
        self,
        *,
        stage: str,
        document_name: str,
        context: dict[str, Any],
        previous_results: dict[str, Any],
        snapshot: dict[str, Any],
    ) -> StageExecutionResult:
        crew, task = self.build_stage_crew(
            stage=stage,
            document_name=document_name,
            context=context,
            previous_results=previous_results,
            snapshot=snapshot,
        )
        output = await crew.kickoff_async()

        task_output = task.output
        if task_output is None and output.tasks_output:
            task_output = output.tasks_output[-1]
        if task_output is None:
            raise ValueError(f"CrewAI 未返回阶段 {stage} 的输出。")

        envelope = self._extract_envelope(task_output)
        return StageExecutionResult(
            summary=envelope.summary.strip(),
            preview=self._parse_json_object(envelope.preview_json, field_name="preview_json"),
            data=self._parse_json_object(envelope.data_json, field_name="data_json"),
        )

    def _build_task_description(
        self,
        *,
        stage: str,
        document_name: str,
        context: dict[str, Any],
        previous_results: dict[str, Any],
        snapshot: dict[str, Any],
    ) -> str:
        spec = STAGE_SPECS[stage]
        return f"""
你正在处理一份中文招标文件《{document_name}》。

你的阶段是：{spec["title"]}
阶段目标：{spec["goal"]}

必须遵守：
- 只能依据下面提供的文档上下文和前序结果，不要脑补。
- 若信息缺失，使用 `missing`；若是根据上下文推断，使用 `inferred`；若多处冲突，使用 `conflicting`。
- 重要字段都要保留 `evidence`，每条 evidence 尽量包含 `excerpt`、`source_path`、`confidence`。
- 只输出当前阶段负责的字段，不要覆盖其它阶段字段。
- `preview_json` 只放适合前端步骤卡预览的精简结果，值必须是 JSON 字符串。
- `data_json` 放当前阶段完整结构化结果，值必须是 JSON 字符串。
- 每条证据尽量同时提供 `source_excerpt`、`matched_text`、`source_section_path` 和 `confidence`。
- 若只能给出原文片段，也请保留能让前端跳转和回看原文的字段，不要丢失证据定位信息。

当前阶段补充规则：
{spec["extra_rules"].strip()}

文档目录 / 结构摘要：
{_json_block(context.get("outline", {}), max_chars=18000)}

文档 markdown 摘要：
{str(context.get("markdown", ""))[:70000]}

前序阶段结果：
{_json_block(previous_results, max_chars=25000)}

当前累计快照：
{_json_block(snapshot, max_chars=25000)}
""".strip()

    @staticmethod
    def _extract_envelope(task_output: Any) -> StageEnvelope:
        if getattr(task_output, "pydantic", None) is not None:
            parsed = task_output.pydantic
            if isinstance(parsed, StageEnvelope):
                return parsed
            return StageEnvelope.model_validate(parsed.model_dump())

        if getattr(task_output, "json_dict", None) is not None:
            return StageEnvelope.model_validate(task_output.json_dict)

        raw = getattr(task_output, "raw", None)
        if not raw:
            raise ValueError("CrewAI 返回了空响应。")

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = TenderAnalysisCrewRunner._extract_json_payload(raw)

        return StageEnvelope.model_validate(payload)

    @staticmethod
    def _parse_json_object(raw: str, *, field_name: str) -> dict[str, Any]:
        try:
            value = json.loads(raw or "{}")
        except json.JSONDecodeError:
            try:
                value = repair_json(raw or "{}", return_objects=True)
            except Exception as exc:
                snippet = (raw or "")[:240].replace("\n", "\\n")
                raise ValueError(f"CrewAI 返回的 {field_name} 不是合法 JSON。片段: {snippet}") from exc
        if not isinstance(value, dict):
            raise ValueError(f"CrewAI 返回的 {field_name} 不是 JSON 对象。")
        return value

    @staticmethod
    def _extract_json_payload(raw: str) -> dict[str, Any]:
        match = re.search(r"\{[\s\S]*\}", raw)
        candidate = match.group(0) if match else raw

        try:
            value = repair_json(candidate, return_objects=True)
        except Exception as exc:
            snippet = candidate[:240].replace("\n", "\\n")
            raise ValueError(f"CrewAI 返回的阶段 envelope 不是合法 JSON。片段: {snippet}") from exc

        if not isinstance(value, dict):
            raise ValueError("CrewAI 返回的阶段 envelope 不是 JSON 对象。")
        return value
