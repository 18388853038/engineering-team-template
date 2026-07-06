/**
 * eCompany Knowledge Management Engine v1.0
 * 知识库/文档管理 — 知识图谱 + 自动整理 + 智能搜索
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ========== 数据存储 ==========

const DATA_PATH = path.join(BASE, 'knowledge-base.json');
const GRAPH_PATH = path.join(BASE, 'knowledge-graph.json');
const CATALOG_PATH = path.join(BASE, 'knowledge-catalog.json');

let entries = [];
let graph = { nodes: [], edges: [] };
let catalog = { categories: [], tags: {} };

function load() {
  try { if (fs.existsSync(DATA_PATH)) entries = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')); } catch(e) { entries = []; }
  try { if (fs.existsSync(GRAPH_PATH)) graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8')); } catch(e) { graph = { nodes: [], edges: [] }; }
  try { if (fs.existsSync(CATALOG_PATH)) catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')); } catch(e) { catalog = { categories: [], tags: {} }; }
  rebuildIndex();
}
load();

function save() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf-8');
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
  rebuildIndex();
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========== 自动分类系统 ==========

const CATEGORY_RULES = [
  { match: /api|接口|endpoint|route|http|rest|graphql/i, category: '技术-API', tags: ['api', '技术'] },
  { match: /数据库|sql|nosql|redis|mongo|mysql|postgres/i, category: '技术-数据库', tags: ['数据库', '技术'] },
  { match: /部署|docker|k8s|kubernetes|ci|cd|jenkins/i, category: '技术-运维', tags: ['运维', 'devops'] },
  { match: /前端|vue|react|angular|html|css|javascript/i, category: '技术-前端', tags: ['前端', '技术'] },
  { match: /后端|node|python|java|go|rust|spring/i, category: '技术-后端', tags: ['后端', '技术'] },
  { match: /安全|漏洞|渗透|防火墙|认证|授权|auth/i, category: '技术-安全', tags: ['安全', '技术'] },
  { match: /产品|需求|prd|原型|ux|ui/i, category: '产品设计', tags: ['产品', '设计'] },
  { match: /项目|任务|工期|排期|进度|敏捷|scrum/i, category: '项目管理', tags: ['项目', '管理'] },
  { match: /市场|运营|推广|营销|seo/i, category: '市场运营', tags: ['市场', '运营'] },
  { match: /合同|法律|合规|审计|policy/i, category: '合规法务', tags: ['合规', '法务'] },
  { match: /配置|设置|config|settings|环境/i, category: '系统配置', tags: ['配置', '系统'] },
  { match: /测试|qa|test|质量|bug|缺陷/i, category: '测试质量', tags: ['测试', '质量'] },
  { match: /培训|教程|学习|文档|手册|指南/i, category: '培训学习', tags: ['培训', '文档'] },
  { match: /会议|纪要|meeting|讨论|决策/i, category: '会议纪要', tags: ['会议', '决策'] },
];



// ========== 倒排索引（内存加速） ==========
// 在 entries 加载/修改时同步重建，searchKnowledge 走索引而非全量遍历
// 索引结构: { '关键词': [{ idx, weight }] }
if (invertedIndex === undefined) invertedIndex = {};

function rebuildIndex() {
  const idx = {};
  entries.forEach((e, i) => {
    const title = (e.title || '').toLowerCase();
    const content = (e.content || '').toLowerCase();
    const tags = (e.tags || []).map(t => t.toLowerCase());
    const cat = (e.category || '').toLowerCase();

    // 提取索引词（英文词 + 中文 2-gram）
    const words = new Set();

    // 英文/数字词
    const titleEng = title.match(/[a-z0-9]+/g) || [];
    const contentEng = content.match(/[a-z0-9]+/g) || [];
    [...titleEng, ...contentEng].forEach(w => { if (w.length >= 2) words.add(w); });

    // 中文 2-gram
    const allHan = (title + content).match(/[\u4e00-\u9fff]/g) || [];
    for (let gi = 0; gi + 1 < allHan.length; gi++) words.add(allHan[gi] + allHan[gi+1]);

    // 完整 title（短标题走精确匹配）
    if (title.length >= 2 && title.length <= 30) words.add('\$t:' + title);
    // tags + category
    tags.forEach(t => { if (t.length >= 2) words.add('\$tag:' + t); });
    if (cat.length >= 2) words.add('\$cat:' + cat);

    const titleWords = new Set(titleEng);
    const tagSet = new Set(tags);

    words.forEach(w => {
      let weight = 1.0;
      if (w.startsWith('\$t:')) weight = 10.0;
      else if (w.startsWith('\$tag:')) weight = 4.0;
      else if (w.startsWith('\$cat:')) weight = 3.0;
      else if (titleWords.has(w)) weight = 2.0;
      else if (tagSet.has(w)) weight = 1.5;
      if (!idx[w]) idx[w] = [];
      idx[w].push({ idx: i, weight });
    });
  });
  invertedIndex = idx;
}

// 修改 load/save 以重建索引
// (load 和 save 已在原文件中定义，这里修改它们)
// 注意：load() 下面的调用将触发 rebuildIndex

function autoClassify(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.match.test(text)) {
      return { category: rule.category, suggestedTags: rule.tags };
    }
  }
  return { category: '未分类', suggestedTags: ['其他'] };
}

// ========== 知识图谱 ==========

function buildGraph() {
  // Clear old graph
  graph.nodes = [];
  graph.edges = [];

  // All entries as nodes
  entries.forEach(e => {
    graph.nodes.push({
      id: e.id,
      label: (e.title||e.summary||"Untitled").substring(0, 50),
      category: e.category || '未分类',
      tags: e.tags || [],
      type: 'entry'
    });
  });

  // Build edges based on shared tags and title similarity
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      const sharedTags = (a.tags || []).filter(t => (b.tags || []).includes(t));
      let weight = 0;

      if (sharedTags.length > 0) {
        weight += sharedTags.length * 0.3;
      }

      // Title word overlap
      const aWords = new Set((a.title || '').toLowerCase().split(/\s+/));
      const bWords = new Set((b.title || '').toLowerCase().split(/\s+/));
      const overlap = [...aWords].filter(w => w.length > 1 && bWords.has(w)).length;
      weight += overlap * 0.5;

      // Same category
      if (a.category && b.category && a.category === b.category) {
        weight += 0.4;
      }

      if (weight > 0.3) {
        graph.edges.push({
          source: a.id,
          target: b.id,
          weight: Math.min(weight, 1),
          sharedTags,
          type: weight > 0.8 ? 'strong' : weight > 0.5 ? 'medium' : 'weak'
        });
      }
    }
  }
}

// ========== 核心操作 ==========

function createEntry(title, content, opts = {}) {
  const classification = autoClassify(title, content);
  const entry = {
    id: uuid(),
    title,
    content,
    tags: [...new Set([...(opts.tags || []), ...classification.suggestedTags])],
    category: opts.category || classification.category,
    author: opts.author || 'system',
    source: opts.source || 'manual',
    status: 'active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: []
  };

  entries.push(entry);
  updateCatalog(entry);
  buildGraph();
  save();
  return entry;
}

function updateEntry(id, updates) {
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;

  const old = entries[idx];
  // Save to history
  old.history = old.history || [];
  old.history.push({
    title: old.title, content: old.content, tags: old.tags,
    category: old.category,
    timestamp: old.updatedAt,
    version: old.version
  });

  // Apply changes
  if (updates.title) old.title = updates.title;
  if (updates.content) old.content = updates.content;
  if (updates.tags) old.tags = [...new Set(updates.tags)];
  if (updates.category) old.category = updates.category;
  if (updates.status) old.status = updates.status;
  old.version++;
  old.updatedAt = new Date().toISOString();

  updateCatalog(old);
  buildGraph();
  save();
  return old;
}

function deleteEntry(id) {
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  buildGraph();
  save();
  return true;
}

// ========== 搜索系统（倒排索引加速） ==========

function searchKnowledge(query, opts = {}) {
  if (!query || query.trim() === '') {
    return entries.slice(0, opts.limit || 50);
  }

  const q = query.toLowerCase();
  const scores = {};

  // 从倒排索引中快速检索命中的 entry
  // 先查精确标题、再查英文词、再查中文 2-gram
  const terms = [];

  // 完整查询作为精确标题词
  if (q.length >= 2 && q.length <= 30) terms.push('$t:' + q);

  // 英文/数字词
  (q.match(/[a-z0-9]+/g) || []).forEach(w => { if (w.length >= 2) terms.push(w); });

  // 中文 2-gram
  const han = q.match(/[\u4e00-\u9fff]/g) || [];
  for (let i = 0; i + 1 < han.length; i++) terms.push(han[i] + han[i+1]);

  // 标签/分类匹配
  terms.push('$tag:' + q);
  terms.push('$cat:' + q);

  // 去重查询
  const uniqueTerms = [...new Set(terms)];

  // 从倒排索引中收集匹配
  uniqueTerms.forEach(term => {
    const hits = invertedIndex[term];
    if (hits) {
      hits.forEach(h => {
        scores[h.idx] = (scores[h.idx] || 0) + h.weight;
      });
    }
  });

  // 内容 contains 回退检查（对索引中可能遗漏的长尾查询）
  // 用 entries.map 做小范围补全
  const hitKeys = Object.keys(scores);
  if (hitKeys.length < 3) {
    // 搜索词较长时，对已命中的条目做 content contains 加分
    entries.forEach((e, i) => {
      const content = (e.content || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      // 已命中且在 content/title 全匹配
      if (scores[i]) {
        if (content.includes(q)) scores[i] += 2;
        if (title.includes(q) && title !== q) scores[i] += 1;
      } else {
        // 索引未命中但 content 包含——做一次降低成本的扫描
        if (content.includes(q) || title.includes(q)) {
          scores[i] = (scores[i] || 0) + 3;
        }
      }
    });
  }

  // 组装结果
  const results = Object.entries(scores)
    .map(([idx, score]) => ({ ...entries[parseInt(idx)], score }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);

  // Apply filters
  let filtered = results;
  if (opts.category) filtered = filtered.filter(e => e.category === opts.category);
  if (opts.tags) {
    const tagFilter = Array.isArray(opts.tags) ? opts.tags : [opts.tags];
    filtered = filtered.filter(e => tagFilter.some(t => (e.tags || []).includes(t)));
  }

  return filtered.slice(0, opts.limit || 20);
}

// ========== 目录/分类管理 ==========

function updateCatalog(entry) {
  // Update category index
  if (entry.category && !catalog.categories.includes(entry.category)) {
    catalog.categories.push(entry.category);
    catalog.categories.sort();
  }

  // Update tag index
  (entry.tags || []).forEach(tag => {
    if (!catalog.tags[tag]) catalog.tags[tag] = { count: 0, entries: [] };
    if (!catalog.tags[tag].entries.includes(entry.id)) {
      catalog.tags[tag].count++;
      catalog.tags[tag].entries.push(entry.id);
    }
  });
}

function getCatalog() {
  // Refresh counts
  const tagCounts = {};
  entries.forEach(e => {
    (e.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  return {
    totalEntries: entries.length,
    totalEdges: graph.edges.length,
    categories: catalog.categories.map(c => ({
      name: c,
      count: entries.filter(e => e.category === c).length
    })),
    tags: Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  };
}

// ========== 统计数据 ==========

function getStats() {
  const active = entries.filter(e => e.status === 'active').length;
  const archived = entries.filter(e => e.status === 'archived').length;
  const catCounts = {};
  entries.forEach(e => {
    if (e.category) catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  });
  return {
    total: entries.length,
    active,
    archived,
    graphEdges: graph.edges.length,
    graphNodes: graph.nodes.length,
    categories: Object.keys(catCounts).length,
    uniqueTags: [...new Set(entries.flatMap(e => e.tags || []))].length,
    categories: catCounts,
    recentActivity: entries
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map(e => ({ id: e.id, title: e.title, category: e.category, updatedAt: e.updatedAt }))
  };
}

// ========== 自动组织 ==========

function autoOrganize() {
  let changes = 0;
  entries.forEach(e => {
    const classification = autoClassify(e.title, e.content);
    if (classification.category !== e.category) {
      const oldCat = e.category;
      e.category = classification.category;
      e.tags = [...new Set([...(e.tags || []), ...classification.suggestedTags])];
      changes++;
    }
  });
  buildGraph();
  save();
  return { reorganized: changes, total: entries.length };
}

// ========== 关系查询 ==========

function getRelated(id, limit = 5) {
  const edges = graph.edges.filter(e => e.source === id || e.target === id)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);

  const relatedIds = new Set();
  edges.forEach(e => {
    if (e.source === id) relatedIds.add(e.target);
    if (e.target === id) relatedIds.add(e.source);
  });

  return [...relatedIds].map(rid => {
    const entry = entries.find(e => e.id === rid);
    if (!entry) return null;
    const edge = edges.find(e => (e.source === id && e.target === rid) || (e.target === id && e.source === rid));
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      tags: entry.tags,
      relation: edge ? { weight: edge.weight, type: edge.type, sharedTags: edge.sharedTags } : null
    };
  }).filter(Boolean);
}

// ========== HTTP 路由 ==========

function registerKnowledgeRoutes(registerRoute, parseBody, json) {
  // 知识条目 CRUD
  registerRoute(['GET'], /^\/api\/kb\/entries$/, (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const q = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const results = q ? searchKnowledge(q, { limit }) : entries.slice(0, limit).map(e => ({ ...e, content: (e.content||e.detail||"").substring(0, 200) }));
    json(res, { ok: true, total: entries.length, items: results });
  });

  registerRoute(['POST'], /^\/api\/kb\/entries$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const { title, content, tags, category, source } = body;
      if (!title || !content) { json(res, { success: false, error: '缺少title或content' }, 400); return; }
      const entry = createEntry(title, content, { tags, category, source, author: body.author });
      json(res, { success: true, ok: true, entry });
    } catch(e) { json(res, { success: false, ok: false, error: e.message }, 500); }
  });

  registerRoute(['GET'], /^\/api\/kb\/entries\/([^/]+)$/, (req, res, m) => {
    const entry = entries.find(e => e.id === m[1]);
    if (!entry) { json(res, { error: '未找到' }, 404); return; }
    const related = getRelated(m[1]);
    json(res, { ok: true, entry, related });
  });

  registerRoute(['PUT'], /^\/api\/kb\/entries\/([^/]+)$/, async (req, res, m) => {
    try {
      const body = await parseBody(req);
      const updated = updateEntry(m[1], body);
      if (!updated) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, entry: updated });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  registerRoute(['DELETE'], /^\/api\/kb\/entries\/([^/]+)$/, (req, res, m) => {
    const ok = deleteEntry(m[1]);
    json(res, { ok, message: ok ? '已删除' : '未找到' });
  });

  // 搜索
  registerRoute(['GET'], /^\/api\/kb\/search$/, (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const q = url.searchParams.get('q') || '';
    const category = url.searchParams.get('category') || '';
    const tag = url.searchParams.get('tag') || '';
    const results = searchKnowledge(q, { category, tags: tag ? [tag] : undefined });
    json(res, { ok: true, total: results.length, items: results });
  });

  // 目录/分类
  registerRoute(['GET'], /^\/api\/kb\/catalog$/, (req, res) => {
    json(res, { ok: true, ...getCatalog() });
  });

  // 知识图谱
  registerRoute(['GET'], /^\/api\/kb\/graph$/, (req, res) => {
    json(res, { ok: true, nodes: graph.nodes.slice(0, 100), edges: graph.edges.slice(0, 200) });
  });

  // 关联查询
  registerRoute(['GET'], /^\/api\/kb\/entries\/([^/]+)\/related$/, (req, res, m) => {
    const related = getRelated(m[1]);
    json(res, { ok: true, related });
  });

  // 统计
  registerRoute(['GET'], /^\/api\/kb\/stats$/, (req, res) => {
    json(res, { ok: true, ...getStats() });
  });

  // 自动整理
  registerRoute(['POST'], /^\/api\/kb\/organize$/, (req, res) => {
    const result = autoOrganize();
    json(res, { ok: true, result });
  });

  // 版本历史
  registerRoute(['GET'], /^\/api\/kb\/entries\/([^/]+)\/history$/, (req, res, m) => {
    const entry = entries.find(e => e.id === m[1]);
    if (!entry) { json(res, { error: '未找到' }, 404); return; }
    json(res, { ok: true, versions: (entry.history || []).slice(-20) });
  });
}


// Export inverted index for external tools
module.exports = {
  createEntry, updateEntry, deleteEntry,
  searchKnowledge, autoClassify,
  getRelated, getCatalog, getStats,
  autoOrganize,
  registerKnowledgeRoutes,
  rebuildIndex
};
module.exports.invertedIndex = invertedIndex;
