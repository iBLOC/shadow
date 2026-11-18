#!/usr/bin/env node
/**
 * 本体网络闸 —— 「**图能进化成本体**」这一刀的门面
 * ============================================================================
 *
 * ## 它钉什么
 *
 * 2026-11-17 那一刀给海马体加了一层**本体网络**：
 *
 *   · **模式**：类／关系类型／属性类型（不再是「一条没有名字的共现边」）；
 *   · **出处**：每条事实都写着它是**自动总结**的、**用户传授**的，还是
 *     **外部本体导入**的（三个优先级）；
 *   · **总结**：记忆正文 ⇒ 带类型的关系与属性；
 *   · **传授**：用户亲口教的那条 ⇒ 压住自动总结的那条；
 *   · **外部加载**：JSON ／ Turtle 子集 ⇒ 搬进同一张网；
 *   · **查询**：三元组当表 ⇒ DataFusion SQL（关系 JOIN 属性）。
 *
 * ⚠️ 为什么要有闸：这一层是**「多出来的一面」** ⇒ ⇒ 删掉它编译照样过
 * ⇒ ⇒ 唯一的证据是**形状**。
 *
 * ## 十一条
 *
 *   O1 出处列：三档出处 ＋ 优先级（extracted 1 ＜ imported 2 ＜ taught 3）
 *   O2 存储面：本体面住在 **core**（trait ＋ 图背书实现），不另开数据集
 *   O3 总结面：关系/属性抽取器（规则 ＋ LLM ＋ 回退）三件套
 *   O4 传授面：**用户传授**压得住自动总结（属性冲突才取代）
 *   O5 外部加载：JSON ＋ Turtle 两个入口 ＋ 落库那一步
 *   O6 查询面：DataFusion SQL，三元组是一张**表**
 *   O7 服务端：七条路由 ＋ **人格在路径里**（TENANT_PATH_COLLECTIONS）
 *   O8 **负控**：旧的共现通道（CO_OCCURS_WITH）**还在**
 *      ⇒ ⇒ 本体是**加**的一层，不是把旧图通道换掉
 *   O9 摄取面：一张「行 × 列」的表 ⇒ 实体与关系（**模板驱动**）
 *      ⇒ ⇒ **通用性是可判的**：摄取器里**不许**出现具体场景词
 *      ⇒ ⇒ 换场景只换**模板**（数据），不换代码
 *   O10 模板面：**用户自己写**的那一半（骨架 ＋ 多表 ＋ 入库 ＋ 试运行）
 *   O11 表格导入面：**agent 从表头 ＋ 前几行建本体**，再写全量数据
 *      （顶叶解析 ＋ 采样 ＋ 回调前额叶推断 ＋ 先试运行后写入）
 *      ⇒ ⇒ 场景差异仍在**数据**里（推断出来的那份模板包）
 *   O12 线上接线面：端脑的 **JSON-RPC 信封** ⇄ 叶区的 **A2A 入口**
 *      （两种报文形状 ＋ 身份注入 ＋ 附件字节上线 ＋ 数据类 ⇒ 顶叶）
 *
 * ## 用法
 *
 *   node scripts/check-ontology-network.mjs              # 判
 *   node scripts/check-ontology-network.mjs --self-test  # 判据自检（N/N）
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ≠ 没问题）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sibling } from './lib/sibling-repo.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NL = String.fromCharCode(10);

/** 判据条数（自检与「N/N」读数都用它 ⇒ ⇒ 不许手写一个会漂的数）。 */
export const RULE_COUNT = 12;

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
function hits(src, needle) {
  if (!needle) return 0;
  return src.split(needle).length - 1;
}

/**
 * 去掉注释（行注释 ＋ 块注释）⇒ ⇒ 「场景词」那条负控只判**代码**。
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(NL)
    .map((line) => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join(NL);
}

/**
 * 具体场景词（HR ＋ CRM 那一族的词）⇒ ⇒ **摄取器与模板面里不许出现它们**。
 *
 * ⚠️ 这是一张**负控词表**（不是业务词表）⇒ ⇒ 它的作用是让「通用」这件事
 * **可判**：换场景只能换**模板**（数据），不能把场景写进代码。
 *
 * ⚠️⚠️ **词表必须随场景扩** ⇒ ⇒ 不然这道闸会把「HR 通用」当成「通用」
 *    （那是尺子自己骗自己）⇒ ⇒ 每加一族场景 ⇒ ⇒ 这里要加它的词。
 */
export const SCENARIO_WORDS = [
  '员工', '部门', '花名册', '工号', '职级', '入职', '姓名', '直属上级',
  '客户', '联系人', '线索', '阶段', '渠道', '合同', '订单',
];

/** 所有判据都要出现的词元（一条判据 = 一组必须都在的词元）。 */
function requireAll(src, tokens) {
  return tokens.filter((t) => hits(src, t) === 0);
}

/**
 * 纯函数：各源文件的内容 ⇒ ⇒ 结论。
 * ⚠️ **零 I/O** ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ 自检不会恒绿。
 */
export function evaluate(sources) {
  const findings = [];
  const add = (rule, file, detail) => findings.push({ rule, file, detail });

  const types = sources.types || '';
  const store = sources.store || '';
  const extraction = sources.extraction || '';
  const teaching = sources.teaching || '';
  const loader = sources.loader || '';
  const linker = sources.linker || '';
  const ingest = sources.ingest || '';
  const template = sources.template || '';
  const storage = sources.storage || '';
  const serverHandlers = sources.serverHandlers || '';
  const serverLib = sources.serverLib || '';
  const serverAuth = sources.serverAuth || '';
  const parietalIngestFiles = [
    sources.parietalIngestMod,
    sources.parietalIngestParse,
    sources.parietalIngestSample,
    sources.parietalIngestInfer,
    sources.parietalIngestSkill,
  ].map((src) => src || '');
  const parietalIngest = parietalIngestFiles.join(NL);
  const parietalClient = sources.parietalClient || '';
  const prefrontalInfer = sources.prefrontalInfer || '';
  const prefrontalRoutes = sources.prefrontalRoutes || '';
  const telencephalonLobes = sources.telencephalonLobes || '';
  const telencephalonA2AClient = sources.telencephalonA2AClient || '';
  const synapseLeafEntry = sources.synapseLeafEntry || '';
  const parietalIngestSkill = sources.parietalIngestSkill || '';
  const mobileEncoder = sources.mobileEncoder || '';

  // O1 —— 出处列与优先级
  {
    const missing = requireAll(types, [
      'pub enum TripleSource',
      'Extracted { memory_uri: String }',
      'Taught {',
      'Imported {',
      'Self::Extracted { .. } => 1',
      'Self::Imported { .. } => 2',
      'Self::Taught { .. } => 3',
    ]);
    if (missing.length > 0) {
      add('O1', 'hippocampus-core/src/ontology/types.rs',
        '出处列或优先级不在了（缺：' + missing.join('、') + '）⇒ ⇒ 「这条事实是谁说的」这一层没了');
    }
  }

  // O2 —— 存储面（trait 在 core，实装也住在 core：本体是那层图的有类型视图）
  {
    const missing = requireAll(store, [
      'pub trait OntologyStore',
      'pub struct GraphOntologyStore',
      'async fn add_triples',
      'async fn list_triples',
      'async fn entity_profile',
    ]);
    if (missing.length > 0) {
      add('O2', 'hippocampus-core/src/ontology/store.rs',
        '本体存储面不在了（缺：' + missing.join('、') + '）⇒ ⇒ 三元组没有落库的地方');
    }
  }

  // O3 —— 总结面（规则 ＋ LLM ＋ 回退）
  {
    const missing = requireAll(extraction, [
      'pub trait RelationExtractor',
      'pub struct HeuristicRelationExtractor',
      'pub struct LlmRelationExtractor',
      'pub struct FallbackRelationExtractor',
    ]);
    if (missing.length > 0) {
      add('O3', 'hippocampus-core/src/ontology/extraction.rs',
        '关系/属性抽取器不在了（缺：' + missing.join('、') + '）⇒ ⇒ 记忆只能变成没有类型的共现边');
    }
  }

  // O4 —— 传授面（用户传授压得住自动总结）
  {
    const missing = requireAll(teaching, [
      'pub async fn teach(',
      'TripleSource::Taught',
      'is_attribute()',
      'superseded_by',
    ]);
    if (missing.length > 0) {
      add('O4', 'hippocampus-core/src/ontology/teaching.rs',
        '用户传授这一面不在了（缺：' + missing.join('、') + '）⇒ ⇒ 用户的话压不住机器的猜测');
    }
  }

  // O5 —— 外部加载
  {
    const missing = requireAll(loader, [
      'pub fn parse_json_ontology',
      'pub fn parse_turtle_ontology',
      'pub async fn apply_loaded',
      'SchemaSource::Imported',
    ]);
    if (missing.length > 0) {
      add('O5', 'hippocampus-core/src/ontology/loader.rs',
        '外部本体的加载入口不在了（缺：' + missing.join('、') + '）⇒ ⇒ 外面已有的本体搬不进来');
    }
  }

  // O6 —— 查询面（DataFusion SQL，三元组当表）
  {
    const missing = requireAll(storage, [
      'pub const TRIPLES_TABLE: &str = "ontology_triples"',
      'pub async fn ontology_query_json',
      'LanceSqlEngine',
      'datafusion',
    ]);
    if (missing.length > 0) {
      add('O6', 'hippocampus-storage/src/ontology.rs',
        '本体的 SQL 查询面不在了（缺：' + missing.join('、') + '）⇒ ⇒ 三元组只能一条条读，不能当数据分析');
    }
  }

  // O7 —— 服务端：老七条路由 ＋ 人格在路径里（摄取那条归 O9）
  {
    const missing = requireAll(serverHandlers, [
      'pub async fn get_schema',
      'pub async fn teach_fact',
      'pub async fn import_ontology',
      'pub async fn summarize',
      'pub async fn get_entity',
      'pub async fn query_ontology',
      'pub async fn list_triples',
    ]);
    const missingRoutes = requireAll(serverLib, [
      '/api/ontology/{tenant}/schema',
      '/api/ontology/{tenant}/teach',
      '/api/ontology/{tenant}/import',
      '/api/ontology/{tenant}/summarize',
      '/api/ontology/{tenant}/query',
      '/api/ontology/{tenant}/entity/{name}',
      '/api/ontology/{tenant}/triples',
    ]);
    const missingAuth = requireAll(serverAuth, ['"ontology",']);
    if (missing.length > 0 || missingRoutes.length > 0 || missingAuth.length > 0) {
      add('O7', 'hippocampus-server/src/handlers_ontology.rs',
        '本体那一面不是七条路由齐的（处理器缺：' + missing.join('、') +
        '；路由缺：' + missingRoutes.join('、') +
        '；人格路径集合缺：' + missingAuth.join('、') + '）');
    }
  }

  // O8 —— **负控**：旧的共现通道还在
  //    ⚠️ 本体是**加**上去的一层 ⇒ ⇒ 不许把旧图通道悄悄换掉。
  {
    const missing = requireAll(linker, ['CO_OCCURS_WITH', 'pub struct EpisodeLinker']);
    if (missing.length > 0) {
      add('O8', 'hippocampus-core/src/extraction/linker.rs',
        '旧的共现通道不见了（缺：' + missing.join('、') +
        '）⇒ ⇒ 本体变成了「替换」而不是「加一层」⇒ ⇒ 记忆进图那条路被悄悄拆了');
    }
  }

  // O9 —— 摄取面：一张表 ⇒ 实体与关系（**模板驱动** ⇒ 场景差异是数据）
  {
    const missing = requireAll(ingest, [
      'pub struct ImportTemplate',
      'pub struct Table',
      'pub struct IngestReport',
      'pub fn ingest_table(',
      'pub async fn ingest_into(',
    ]);
    const missingHandler = requireAll(serverHandlers, ['pub async fn ingest_table']);
    const missingRoutes = requireAll(serverLib, ['/api/ontology/{tenant}/ingest']);
    // ⚠️ **通用性是可判的**：摄取器**不许**出现具体场景词
    //    ⇒ ⇒ 场景差异只能落在**模板**（数据）里。
    // ⚠️ 只判**实现段**：注释不算（文档里可以说明口径），
    //    `#[cfg(test)]` 之后是测试（测试里当然可以出现场景词）。
    const implementation = stripComments(ingest.split('#[cfg(test)]')[0]);
    const leaked = SCENARIO_WORDS.filter((word) => hits(implementation, word) > 0);
    if (missing.length > 0 || missingHandler.length > 0 || missingRoutes.length > 0 || leaked.length > 0) {
      add('O9', 'hippocampus-core/src/ontology/ingest.rs',
        '表格摄取面不在了，或场景词漏进了摄取器（摄取器缺：' + missing.join('、') +
        '；处理器缺：' + missingHandler.join('、') +
        '；路由缺：' + missingRoutes.join('、') +
        '；场景词：' + leaked.join('、') +
        '）⇒ ⇒ 「换场景只换模板」这条口径破了');
    }
  }

  // O10 —— 模板面：**用户自己写**的那一半（骨架 ＋ 多表 ＋ 入库 ＋ 试运行）
  {
    const missing = requireAll(template, [
      'pub struct TemplatePackage',
      'pub struct SchemaTemplate',
      'pub struct TableTemplate',
      'pub async fn save_template',
      'pub async fn load_template',
      'pub async fn list_templates',
      'pub async fn dry_run_package',
      'pub async fn ingest_package_into',
    ]);
    // ⚠️ 试运行与正式摄取**共用同一处判读** ⇒ ⇒ 两者的数字必须一致
    //    （否则「试运行说写 N 条、真跑写了 M 条」＝ 尺子在骗人）。
    const missingPlan = requireAll(ingest, ['pub fn plan_writes']);
    const missingCall = requireAll(template, ['plan_writes']);
    const missingHandler = requireAll(serverHandlers, [
      'pub async fn save_template',
      'pub async fn list_templates',
      'pub async fn get_template',
      'pub async fn dry_run_template',
      'pub async fn ingest_template_package',
    ]);
    const missingRoutes = requireAll(serverLib, [
      '/api/ontology/{tenant}/templates',
      '/api/ontology/{tenant}/templates/{id}',
      '/api/ontology/{tenant}/templates/{id}/dry-run',
      '/api/ontology/{tenant}/templates/{id}/ingest',
    ]);
    // ⚠️ **通用性是可判的**：模板面（core ＋ 服务端）里**不许**出现具体场景词
    //    ⇒ ⇒ 场景差异只能落在模板**数据**里（用户自己写的 JSON）。
    const implementation = [
      stripComments(template.split('#[cfg(test)]')[0]),
      stripComments(serverHandlers.split('#[cfg(test)]')[0]),
    ].join(NL);
    const leaked = SCENARIO_WORDS.filter((word) => hits(implementation, word) > 0);
    if (
      missing.length > 0 ||
      missingPlan.length > 0 ||
      missingCall.length > 0 ||
      missingHandler.length > 0 ||
      missingRoutes.length > 0 ||
      leaked.length > 0
    ) {
      add('O10', 'hippocampus-core/src/ontology/template.rs',
        '模板面不在了，或场景词漏进了模板面（模板缺：' + missing.join('、') +
        '；共用判读缺：' + missingPlan.join('、') +
        '；判读调用缺：' + missingCall.join('、') +
        '；处理器缺：' + missingHandler.join('、') +
        '；路由缺：' + missingRoutes.join('、') +
        '；场景词：' + leaked.join('、') +
        '）⇒ ⇒ 「用户自己定义本体、场景只换 JSON」这条口径破了');
    }
  }

  // O11 —— 表格导入面：**agent 建本体**的那一刀（顶叶 ＋ 前额叶 ＋ 端脑 ＋ 客户端）
  //
  // ⚠️ 这一条钉的是**形状**，不是「跑通了」⇒ ⇒ 形状钉住 ⇒ ⇒ 「采样建本体
  //    ＋ 再写数据」这条口径就不会悄悄退化成「按固定模板写」。
  {
    const missingIngest = requireAll(parietalIngest, [
      'pub fn parse_tables',
      'pub fn parse_table',
      'pub fn sample_table',
      'pub fn sample_tables',
      'pub struct OntologyInferClient',
      'pub struct IngestSpreadsheetSkill',
      '"ingest_spreadsheet"',
    ]);
    const missingClient = requireAll(parietalClient, [
      'pub async fn save_template',
      'pub async fn dry_run_template',
      'pub async fn ingest_template_package',
    ]);
    const missingInfer = requireAll(prefrontalInfer, [
      'pub async fn infer_ontology',
      'pub fn system_prompt',
      'pub fn parse_package',
    ]);
    const missingRoute = requireAll(prefrontalRoutes, ['/api/ontology/infer']);
    const missingTel = requireAll(telencephalonLobes, [
      'AttachmentKind::Spreadsheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    const missingMobile = requireAll(mobileEncoder, [
      'AttachmentKind.spreadsheet',
      "'xlsx':",
    ]);
    // ⚠️ **顺序**：试运行**在**写入之前 ⇒ ⇒ 数字先出来 ⇒ ⇒ 用户看得见
    //    「会写多少」才决定要不要真写。
    const dryAt = parietalIngest.indexOf('.dry_run_template(');
    const ingestAt = parietalIngest.indexOf('.ingest_template_package(');
    const ordered = dryAt >= 0 && ingestAt >= 0 && dryAt < ingestAt;
    // ⚠️ **采样与写入是两份数据** ⇒ ⇒ 建本体只用表头 ＋ 前几行。
    const sampled = parietalIngest.includes('sample_tables(');
    // ⚠️ **通用性依然可判**：这一刀的实现段里**不许**出现具体场景词
    //    ⇒ ⇒ 场景差异仍然只能落在**模板数据**（推断出来的那份 JSON）里。
    // ⚠️⚠️ **逐文件**切 `#[cfg(test)]` ⇒ ⇒ 每个文件只判它**自己的**
    //    实现段 ⇒ ⇒ 位置因文件而异也不会牵连别的文件。
    //    （真文件上的真变异逮到过：对拼接后的串切 ⇒ ⇒ 只切掉第一个文件
    //    的那一处 ⇒ ⇒ 后面的文件整段都还在 ⇒ ⇒ 尺子钝了。）
    const implementation = [
      ...parietalIngestFiles.map((src) => stripComments(src.split('#[cfg(test)]')[0])),
      stripComments(prefrontalInfer.split('#[cfg(test)]')[0]),
    ].join(NL);
    const leaked = SCENARIO_WORDS.filter((word) => hits(implementation, word) > 0);
    if (
      missingIngest.length > 0 ||
      missingClient.length > 0 ||
      missingInfer.length > 0 ||
      missingRoute.length > 0 ||
      missingTel.length > 0 ||
      missingMobile.length > 0 ||
      !ordered ||
      !sampled ||
      leaked.length > 0
    ) {
      add('O11', 'parietal/src/ingest/ ＋ prefrontal/src/server/ontology_infer.rs',
        '表格导入面不在了（导入面缺：' + missingIngest.join('、') +
        '；海马体接线缺：' + missingClient.join('、') +
        '；推断端点缺：' + missingInfer.join('、') +
        '；路由缺：' + missingRoute.join('、') +
        '；端脑表格档缺：' + missingTel.join('、') +
        '；客户端表格档缺：' + missingMobile.join('、') +
        '；试运行在写入之前：' + (ordered ? '是' : '否') +
        '；建本体只取表头 ＋ 前几行：' + (sampled ? '是' : '否') +
        '；场景词：' + leaked.join('、') +
        '）⇒ ⇒ 「agent 从表头 ＋ 前几行建本体、再写全量数据」这条口径破了');
    }
  }

  // O12 —— 线上接线面：**端脑的 JSON-RPC 信封 ⇄ 叶区的 A2A 入口**
  //
  // ⚠️ 这一条钉的是**接线**（谁发什么、谁收什么、附件字节在不在、数据类
  //    归谁）⇒ ⇒ 形状钉住 ⇒ ⇒ 「一份表格能真的走到顶叶」这条口径就不会
  //    悄悄退化成「注册成功、请求 404」。
  {
    const missingLeaf = requireAll(synapseLeafEntry, [
      'pub fn parse_send_request',
      'pub struct SendRequest',
      '"/api/a2a"',
      '"jsonrpc": "2.0"',
      '"result"',
      '"task"',
      '"status"',
      'user_id',
      '4002',
      '__telencephalon_meta_v1__',
    ]);
    const missingClient = requireAll(telencephalonA2AClient, [
      '"bytes": file.bytes',
      '"file": {',
      'decode_metadata_from_name',
    ]);
    const missingTel = requireAll(telencephalonLobes, [
      'DATA_TASK_SKILL',
      '"ingest_spreadsheet"',
      'dispatch_data_task',
      'AttachmentKind::Spreadsheet',
    ]);
    const missingSkill = requireAll(parietalIngestSkill, [
      'fn resolve_attachment',
      'fn attachment_from_parts',
      '"parts"',
    ]);
    // ⚠️ **负控**：接线面是**通用**的 ⇒ ⇒ 场景词不许进实现段。
    // ⚠️ **逐文件**切 `#[cfg(test)]` ⇒ ⇒ 端脑那个文件里的「客户」在
    //    **测试段** ⇒ ⇒ 不误伤。
    const wiring = [
      stripComments(synapseLeafEntry.split('#[cfg(test)]')[0]),
      stripComments(telencephalonA2AClient.split('#[cfg(test)]')[0]),
    ].join(NL);
    const leaked = SCENARIO_WORDS.filter((word) => hits(wiring, word) > 0);
    if (
      missingLeaf.length > 0 ||
      missingClient.length > 0 ||
      missingTel.length > 0 ||
      missingSkill.length > 0 ||
      leaked.length > 0
    ) {
      add('O12', 'synapse/src/lobe/a2a_server.rs ＋ telencephalon/src/a2a/client.rs',
        '线上接线面不在了（叶区入口缺：' + missingLeaf.join('、') +
        '；端脑客户端缺：' + missingClient.join('、') +
        '；端脑数据类路由缺：' + missingTel.join('、') +
        '；顶叶取附件缺：' + missingSkill.join('、') +
        '；场景词：' + leaked.join('、') +
        '）⇒ ⇒ 「一份表格能真的走到顶叶」这条口径破了');
    }
  }

  return findings;
}

/** 判据源（相对海马体仓根）。 */
const SOURCE_FILES = {
  types: 'hippocampus-core/src/ontology/types.rs',
  store: 'hippocampus-core/src/ontology/store.rs',
  extraction: 'hippocampus-core/src/ontology/extraction.rs',
  teaching: 'hippocampus-core/src/ontology/teaching.rs',
  loader: 'hippocampus-core/src/ontology/loader.rs',
  linker: 'hippocampus-core/src/extraction/linker.rs',
  ingest: 'hippocampus-core/src/ontology/ingest.rs',
  template: 'hippocampus-core/src/ontology/template.rs',
  storage: 'hippocampus-storage/src/ontology.rs',
  serverHandlers: 'hippocampus-server/src/handlers_ontology.rs',
  serverLib: 'hippocampus-server/src/lib.rs',
  serverAuth: 'hippocampus-server/src/auth.rs',
};

/**
 * **跨仓**的判据源（O11 那一刀跨了四个仓）。
 *
 * ⚠️ **为什么单独列**：海马体那一仓的源是**相对它自己的根** ⇒ ⇒ 别的仓
 *    不在这个坐标系里 ⇒ ⇒ 只能按「哪个仓 ＋ 哪个文件」来写。
 *
 * ⚠️ **父仓内**的源（移动端）用 repo: null ⇒ ⇒ 不用去外面找。
 */
const CROSS_SOURCE_FILES = {
  // ⚠️⚠️ **每个文件一个 key** —— 不是「一个仓一个 key」。
  //
  // ⚠️ 为什么（真撞出来的）：负控要判**每个文件各自的实现段** ⇒ ⇒ 而
  //    `#[cfg(test)]` 的位置**因文件而异**（端脑那个文件里它在**中部**
  //    ⇒ ⇒ 后面大半都是测试）⇒ ⇒ 拼成一个串再切 ⇒ ⇒ 只会切掉**第一个**
  //    文件的那一处 ⇒ ⇒ 后面的文件**整段**都还在 ⇒ ⇒ 尺子钝了。
  //    ⇒ ⇒ 一个文件一个 key ⇒ ⇒ 逐个文件切 ⇒ ⇒ 谁也不会被牵连。
  parietalIngestMod: { repo: 'parietal', files: ['src/ingest/mod.rs'] },
  parietalIngestParse: { repo: 'parietal', files: ['src/ingest/parse.rs'] },
  parietalIngestSample: { repo: 'parietal', files: ['src/ingest/sample.rs'] },
  parietalIngestInfer: { repo: 'parietal', files: ['src/ingest/infer.rs'] },
  parietalIngestSkill: { repo: 'parietal', files: ['src/ingest/skill.rs'] },
  parietalClient: { repo: 'parietal', files: ['src/client.rs'] },
  prefrontalInfer: { repo: 'prefrontal', files: ['src/server/ontology_infer.rs'] },
  prefrontalRoutes: { repo: 'prefrontal', files: ['src/server/routes.rs'] },
  telencephalonLobes: { repo: 'telencephalon', files: ['src/lobes/mod.rs'] },
  telencephalonA2AClient: { repo: 'telencephalon', files: ['src/a2a/client.rs'] },
  synapseLeafEntry: { repo: 'synapse', files: ['src/lobe/a2a_server.rs'] },
  mobileEncoder: { repo: null, files: ['shadow-mobile/lib/multimodal/attachment_encoder.dart'] },
};

function readSources(hippoRoot) {
  const sources = {};
  const missing = [];
  for (const [key, rel] of Object.entries(SOURCE_FILES)) {
    const path = join(hippoRoot, rel);
    if (!existsSync(path)) {
      missing.push(rel);
      continue;
    }
    sources[key] = readFileSync(path, 'utf8');
  }
  for (const [key, spec] of Object.entries(CROSS_SOURCE_FILES)) {
    const root = spec.repo === null ? REPO_ROOT : sibling(REPO_ROOT, spec.repo);
    const parts = [];
    for (const rel of spec.files) {
      const path = join(root, rel);
      if (!existsSync(path)) {
        missing.push(spec.repo === null ? rel : spec.repo + '/' + rel);
        continue;
      }
      // ⚠️ **原样读**（不切）⇒ ⇒ 切的动作放在 evaluate 里**逐文件**做
      //    ⇒ ⇒ 因为 `#[cfg(test)]` 的位置因文件而异。
      parts.push(readFileSync(path, 'utf8'));
    }
    sources[key] = parts.join(NL);
  }
  return { sources, missing };
}

/** 自检：合成夹具 ⇒ ⇒ 每一格都有自己的形状 ⇒ ⇒ 自检不会恒绿。 */
function selfTest() {
  const good = {
    types: [
      'pub enum TripleSource {',
      '    Extracted { memory_uri: String },',
      '    Taught { taught_by: String, note: Option<String> },',
      '    Imported { ontology: String, iri: Option<String> },',
      '}',
      'match self {',
      '    Self::Extracted { .. } => 1,',
      '    Self::Imported { .. } => 2,',
      '    Self::Taught { .. } => 3,',
      '}',
    ].join(NL),
    store: [
      'pub trait OntologyStore: Send + Sync {',
      '    async fn add_triples(&self, triples: &[Triple]) -> Result<usize>;',
      '    async fn list_triples(&self, tenant_id: &str, filter: &TripleFilter) -> Result<Vec<Triple>>;',
      '    async fn entity_profile(&self, tenant_id: &str, entity: &str) -> Result<EntityProfile>;',
      '}',
      'pub struct GraphOntologyStore { backend: Arc<dyn GraphBackend> }',
    ].join(NL),
    extraction: [
      'pub trait RelationExtractor: Send + Sync {}',
      'pub struct HeuristicRelationExtractor {}',
      'pub struct LlmRelationExtractor {}',
      'pub struct FallbackRelationExtractor {}',
    ].join(NL),
    teaching: [
      'pub async fn teach(store: &dyn OntologyStore, tenant_id: &str, request: TeachingRequest) -> Result<TeachingOutcome> {',
      '    let source = TripleSource::Taught { taught_by: request.taught_by, note: request.note };',
      '    if old.is_attribute() { old.superseded_by = Some(triple.id); }',
      '}',
    ].join(NL),
    loader: [
      'pub fn parse_json_ontology(content: &str) -> Result<LoadedOntology> {}',
      'pub fn parse_turtle_ontology(content: &str) -> Result<LoadedOntology> {}',
      'pub async fn apply_loaded(store: &dyn OntologyStore, tenant_id: &str, loaded: &LoadedOntology) -> Result<LoadOutcome> {}',
      'let source = SchemaSource::Imported { ontology: loaded.name.clone() };',
    ].join(NL),
    linker: [
      'pub struct EpisodeLinker { graph_backend: Arc<dyn GraphBackend> }',
      '"CO_OCCURS_WITH".to_string(),',
    ].join(NL),
    storage: [
      'pub const TRIPLES_TABLE: &str = "ontology_triples";',
      'pub async fn ontology_query_json(store: &dyn OntologyStore, tenant_id: &str, sql: &str) -> Result<Value> {}',
      'use datafusion::prelude::SessionContext;',
      'LanceSqlEngine::from_batches(&[(TRIPLES_TABLE, batch)]).await?',
    ].join(NL),
    serverHandlers: [
      'pub async fn get_schema() {}',
      'pub async fn teach_fact() {}',
      'pub async fn import_ontology() {}',
      'pub async fn summarize() {}',
      'pub async fn get_entity() {}',
      'pub async fn query_ontology() {}',
      'pub async fn list_triples() {}',
      'pub async fn ingest_table() {}',
      'pub async fn save_template() {}',
      'pub async fn list_templates() {}',
      'pub async fn get_template() {}',
      'pub async fn dry_run_template() {}',
      'pub async fn ingest_template_package() {}',
    ].join(NL),
    serverLib: [
      '"/api/ontology/{tenant}/schema"',
      '"/api/ontology/{tenant}/teach"',
      '"/api/ontology/{tenant}/import"',
      '"/api/ontology/{tenant}/summarize"',
      '"/api/ontology/{tenant}/query"',
      '"/api/ontology/{tenant}/entity/{name}"',
      '"/api/ontology/{tenant}/triples"',
      '"/api/ontology/{tenant}/ingest"',
      '"/api/ontology/{tenant}/templates"',
      '"/api/ontology/{tenant}/templates/{id}"',
      '"/api/ontology/{tenant}/templates/{id}/dry-run"',
      '"/api/ontology/{tenant}/templates/{id}/ingest"',
    ].join(NL),
    ingest: [
      'pub struct Table { pub name: String, pub headers: Vec<String>, pub rows: Vec<Vec<String>> }',
      'pub struct ImportTemplate { pub class: String, pub key_column: String }',
      'pub struct IngestReport { pub entities: usize }',
      'pub fn ingest_table(template: &ImportTemplate, table: &Table, tenant_id: &str) -> Result<(Vec<Triple>, IngestReport)> {}',
      'pub async fn ingest_into(store: &dyn OntologyStore, tenant_id: &str, template: &ImportTemplate, table: &Table) -> Result<IngestOutcome> {}',
      'pub fn plan_writes(existing: &[Triple], incoming: Vec<Triple>) -> WritePlan {}',
    ].join(NL),
    template: [
      'pub struct TemplatePackage { pub id: String, pub version: u32 }',
      'pub struct SchemaTemplate { pub classes: Vec<ClassTemplate> }',
      'pub struct TableTemplate { pub table: String, pub template: ImportTemplate }',
      'pub async fn save_template(store: &dyn OntologyStore, tenant_id: &str, package: &TemplatePackage) -> Result<TemplateSaveOutcome> {}',
      'pub async fn load_template(store: &dyn OntologyStore, tenant_id: &str, id: &str, version: Option<u32>) -> Result<Option<TemplatePackage>> {}',
      'pub async fn list_templates(store: &dyn OntologyStore, tenant_id: &str) -> Result<Vec<TemplateSummary>> {}',
      'pub async fn dry_run_package(store: &dyn OntologyStore, tenant_id: &str, package: &TemplatePackage, tables: &[Table]) -> Result<DryRunReport> {}',
      'pub async fn ingest_package_into(store: &dyn OntologyStore, tenant_id: &str, package: &TemplatePackage, tables: &[Table]) -> Result<PackageIngestOutcome> {}',
      'let plan = plan_writes(&existing, triples);',
    ].join(NL),
    serverAuth: ['const TENANT_PATH_COLLECTIONS: &[&str] = &[', '    "documents",', '    "ontology",', '];'].join(NL),
    parietalIngestMod: ['pub mod skill;'].join(NL),
    parietalIngestParse: ['pub fn parse_tables(', 'pub fn parse_table('].join(NL),
    parietalIngestSample: ['pub fn sample_table(', 'pub fn sample_tables('].join(NL),
    parietalIngestInfer: ['pub struct OntologyInferClient'].join(NL),
    // ⚠️ **这一个夹具带 `#[cfg(test)]`** ⇒ ⇒ 与真文件**同形状**
    //    ⇒ ⇒ 负控「只判实现段」这件事在夹具里也成立。
    parietalIngestSkill: [
      'pub struct IngestSpreadsheetSkill',
      'fn resolve_attachment(',
      'fn attachment_from_parts(',
      'extra.get("parts")',
      '"ingest_spreadsheet"',
      'let samples = sample_tables(&tables, 5);',
      'let dry = self.hippocampus.dry_run_template(',
      'let ing = self.hippocampus.ingest_template_package(',
      '#[cfg(test)]',
      'const 测试里可以有场景词: u8 = 0;',
    ].join(NL),
    parietalClient: [
      'pub async fn save_template(',
      'pub async fn dry_run_template(',
      'pub async fn ingest_template_package(',
    ].join(NL),
    prefrontalInfer: [
      'pub async fn infer_ontology(',
      'pub fn system_prompt()',
      'pub fn parse_package(',
    ].join(NL),
    prefrontalRoutes: ['"/api/ontology/infer"'].join(NL),
    telencephalonLobes: [
      'AttachmentKind::Spreadsheet',
      '"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"',
      'pub const DATA_TASK_SKILL: &str = "ingest_spreadsheet";',
      'async fn dispatch_data_task(',
    ].join(NL),
    telencephalonA2AClient: [
      '"bytes": file.bytes,',
      '"file": {',
      'decode_metadata_from_name(Some(name))',
    ].join(NL),
    synapseLeafEntry: [
      'pub fn parse_send_request(body: &Value) -> Result<SendRequest, SendError> {}',
      'pub struct SendRequest { pub skill: String }',
      'pub fn build_a2a_router(card: AgentCard, skills: Arc<StatelessSkillRouter>) -> Router {}',
      '.route("/api/a2a", send.clone())',
      '"jsonrpc": "2.0",',
      '"result": {',
      '"task": {',
      '"status": {',
      'ctx.get("user_id")',
      'code: 4002,',
      'const TELENCEPHALON_META_PREFIX: &str = "__telencephalon_meta_v1__";',
    ].join(NL),
    mobileEncoder: [
      'AttachmentKind.spreadsheet',
      "'xlsx':",
    ].join(NL),
  };

  // ⚠️ 每条变异**显式写它要撞哪条判据**（`rule`）⇒ ⇒ 判据名与变异名**解耦**
  //    ⇒ ⇒ 一条判据可以有两道不同的变异（O9：摄取面缺了 ／ 场景词漏进来了）。
  const mutations = [
    { rule: 'O1', label: 'O1', mutate: (s) => { s.types = s.types.replace('Self::Taught { .. } => 3', 'Self::Taught { .. } => 1'); } },
    { rule: 'O2', label: 'O2', mutate: (s) => { s.store = s.store.replace('pub struct GraphOntologyStore', 'pub struct SomethingElse'); } },
    { rule: 'O3', label: 'O3', mutate: (s) => { s.extraction = s.extraction.replace('pub struct LlmRelationExtractor', 'pub struct Other'); } },
    { rule: 'O4', label: 'O4', mutate: (s) => { s.teaching = s.teaching.replace('pub async fn teach(', 'pub async fn record('); } },
    { rule: 'O5', label: 'O5', mutate: (s) => { s.loader = s.loader.replace('pub fn parse_turtle_ontology', 'pub fn parse_ttl'); } },
    { rule: 'O6', label: 'O6', mutate: (s) => { s.storage = s.storage.replace('ontology_triples', 'triples'); } },
    { rule: 'O7', label: 'O7', mutate: (s) => { s.serverAuth = s.serverAuth.replace('    "ontology",' + NL, ''); } },
    { rule: 'O8', label: 'O8', mutate: (s) => { s.linker = s.linker.replace('"CO_OCCURS_WITH".to_string(),', ''); } },
    { rule: 'O9', label: 'O9（摄取面缺了）', mutate: (s) => { s.ingest = s.ingest.replace('pub fn ingest_table(', 'pub fn ingest_rows('); } },
    { rule: 'O9', label: 'O9（场景词漏进了摄取器）', mutate: (s) => { s.ingest = s.ingest.replace('pub struct IngestReport {', 'pub struct IngestReport { const 员工: u8 = 0;'); } },
    { rule: 'O10', label: 'O10（模板面缺了）', mutate: (s) => { s.template = s.template.replace('pub struct TemplatePackage', 'pub struct SomethingElse'); } },
    { rule: 'O10', label: 'O10（场景词漏进了模板面）', mutate: (s) => { s.template = s.template.replace('pub struct TemplatePackage', 'pub struct TemplatePackage { const 客户: u8 = 0;'); } },
    { rule: 'O11', label: 'O11（导入面缺了）', mutate: (s) => { s.parietalIngestSample = s.parietalIngestSample.replace('pub fn sample_tables(', 'pub fn take_rows('); } },
    { rule: 'O11', label: 'O11（写入排在试运行之前）', mutate: (s) => {
      s.parietalIngestSkill = s.parietalIngestSkill.replace(
        'let dry = self.hippocampus.dry_run_template(' + NL + 'let ing = self.hippocampus.ingest_template_package(',
        'let ing = self.hippocampus.ingest_template_package(' + NL + 'let dry = self.hippocampus.dry_run_template('
      );
    } },
    { rule: 'O11', label: 'O11（场景词漏进了导入面）', mutate: (s) => { s.parietalIngestSkill = s.parietalIngestSkill.replace('pub struct IngestSpreadsheetSkill', 'pub struct IngestSpreadsheetSkill { const 订单: u8 = 0;'); } },
    { rule: 'O12', label: 'O12（线上接线面缺了）', mutate: (s) => { s.synapseLeafEntry = s.synapseLeafEntry.replace('pub fn parse_send_request', 'pub fn take_request'); } },
    { rule: 'O12', label: 'O12（场景词漏进了接线面）', mutate: (s) => { s.telencephalonA2AClient = s.telencephalonA2AClient.replace('"bytes": file.bytes,', '"bytes": file.bytes, const 客户: u8 = 0,'); } },
  ];

  let total = 0;
  let failed = 0;
  const check = (name, cond) => {
    total += 1;
    if (!cond) failed += 1;
    console.log((cond ? '  [PASS] ' : '  [FAIL] ') + name);
  };

  check('合规夹具零告警', evaluate(good).length === 0);

  for (const { rule, label, mutate } of mutations) {
    const broken = JSON.parse(JSON.stringify(good));
    mutate(broken);
    const findings = evaluate(broken);
    const rules = Array.from(new Set(findings.map((f) => f.rule)));
    check(
      '变异 ' + label + ' 恰好被它自己逮到（且不牵连别条）',
      rules.length === 1 && rules[0] === rule
    );
  }

  console.log('判据自检：' + (total - failed) + '/' + total);
  if (failed > 0) {
    console.error('❌ 自检失败：' + failed + ' 条');
    process.exit(1);
  }
  console.log('✅ 自检通过');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }
  const hippoRoot = sibling(REPO_ROOT, 'hippocampus');
  const { sources, missing } = readSources(hippoRoot);
  if (missing.length > 0) {
    console.error('❌ 判不了：海马体仓的判据源没读全 ⇒ ⇒ 缺失：');
    for (const m of missing) console.error('   - ' + join(hippoRoot, m));
    console.error('（这不是「没问题」，是「没判」）');
    process.exit(2);
  }
  const findings = evaluate(sources);
  if (findings.length > 0) {
    console.error('❌ 本体网络闸红：' + findings.length + ' 条');
    for (const f of findings) {
      console.error('  [' + f.rule + '] ' + f.file);
      console.error('      ' + f.detail);
    }
    process.exit(1);
  }
  console.log('✅ 本体网络闸绿：' + RULE_COUNT + '/' + RULE_COUNT + ' 条判据');
}

main();
