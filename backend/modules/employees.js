// backend/modules/employees.js
// 员工管理 API 模块
// 为前端提供员工列表、详情、创建、更新、删除等功能

const fs = require('fs');
const path = require('path');

// 员工数据文件路径
const EMPLOYEES_FILE = path.join(__dirname, '..', 'data', 'employees.json');

// 确保数据目录存在
function ensureDataDir() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(EMPLOYEES_FILE)) {
    // 创建默认员工数据（41名AI员工）- 符合Chat.vue期望的格式
    const defaultEmployees = [
      // 管理层 (5)
      { id: 'ai_ceo', name_cn: 'CEO', icon: '👑', title: '首席执行官', status: 'online' },
      { id: 'ai_cto', name_cn: 'CTO', icon: '🔧', title: '首席技术官', status: 'online' },
      { id: 'ai_cpo', name_cn: 'CPO', icon: '📊', title: '首席产品官', status: 'online' },
      { id: 'ai_coo', name_cn: 'COO', icon: '⚙️', title: '首席运营官', status: 'online' },
      { id: 'ai_ciso', name_cn: 'CISO', icon: '🔒', title: '首席信息安全官', status: 'online' },
      
      // 总监 (5)
      { id: 'ai_architect', name_cn: '架构师', icon: '🏗️', title: '系统架构总监', status: 'online' },
      { id: 'ai_fe_dir', name_cn: '前端总监', icon: '🎨', title: '前端开发总监', status: 'online' },
      { id: 'ai_be_dir', name_cn: '后端总监', icon: '⚡', title: '后端开发总监', status: 'online' },
      { id: 'ai_qa_dir', name_cn: 'QA总监', icon: '🧪', title: '质量保证总监', status: 'online' },
      { id: 'ai_sec_dir', name_cn: '安全总监', icon: '🛡️', title: '网络安全总监', status: 'online' },
      
      // 资深工程师 (8)
      { id: 'ai_sr_frontend', name_cn: '资深前端', icon: '💻', title: '资深前端工程师', status: 'online' },
      { id: 'ai_sr_backend', name_cn: '资深后端', icon: '🖥️', title: '资深后端工程师', status: 'online' },
      { id: 'ai_sr_fullstack', name_cn: '资深全栈', icon: '🌐', title: '资深全栈工程师', status: 'online' },
      { id: 'ai_sr_ai', name_cn: '资深AI', icon: '🤖', title: '资深AI工程师', status: 'online' },
      { id: 'ai_sr_mobile', name_cn: '资深移动端', icon: '📱', title: '资深移动端工程师', status: 'online' },
      { id: 'ai_sr_devops', name_cn: '资深DevOps', icon: '🚀', title: '资深DevOps工程师', status: 'online' },
      { id: 'ai_sr_data', name_cn: '资深数据', icon: '📈', title: '资深数据工程师', status: 'online' },
      { id: 'ai_sr_sec', name_cn: '资深安全', icon: '🔐', title: '资深安全工程师', status: 'online' },
      
      // 工程师 (15)
      { id: 'ai_sec_engineer1', name_cn: '安全工程师1', icon: '🔒', title: '安全工程师', status: 'online' },
      { id: 'ai_sec_engineer2', name_cn: '安全工程师2', icon: '🔒', title: '安全工程师', status: 'online' },
      { id: 'ai_fe_vue', name_cn: 'Vue开发', icon: '💚', title: 'Vue开发工程师', status: 'online' },
      { id: 'ai_fe_react', name_cn: 'React开发', icon: '⚛️', title: 'React开发工程师', status: 'online' },
      { id: 'ai_be_python', name_cn: 'Python开发', icon: '🐍', title: 'Python开发工程师', status: 'online' },
      { id: 'ai_be_java', name_cn: 'Java开发', icon: '☕', title: 'Java开发工程师', status: 'online' },
      { id: 'ai_be_go', name_cn: 'Go开发', icon: '🐹', title: 'Go开发工程师', status: 'online' },
      { id: 'ai_mobile_ios', name_cn: 'iOS开发', icon: '🍎', title: 'iOS开发工程师', status: 'online' },
      { id: 'ai_mobile_android', name_cn: 'Android开发', icon: '🤖', title: 'Android开发工程师', status: 'online' },
      { id: 'ai_test_auto', name_cn: '自动化测试', icon: '🤖', title: '自动化测试工程师', status: 'online' },
      { id: 'ai_test_manual', name_cn: '手动测试', icon: '🧪', title: '手动测试工程师', status: 'online' },
      { id: 'ai_db_admin', name_cn: 'DBA', icon: '🗄️', title: '数据库管理员', status: 'online' },
      { id: 'ai_ui_design', name_cn: 'UI设计', icon: '🎨', title: 'UI设计师', status: 'online' },
      { id: 'ai_sre', name_cn: 'SRE', icon: '🔥', title: '可靠性工程师', status: 'online' },
      { id: 'ai_doc_dev', name_cn: '文档工程师', icon: '📝', title: '文档工程师', status: 'online' },
      
      // 全栈 (8)
      { id: 'ai_sr_fullstack2', name_cn: '全栈工程师2', icon: '🌐', title: '全栈工程师', status: 'online' },
      { id: 'ai_sr_fullstack3', name_cn: '全栈工程师3', icon: '🌐', title: '全栈工程师', status: 'online' },
      { id: 'ai_fs_xuwenbin', name_cn: '全栈工程师', icon: '👨‍💻', title: '全栈工程师', status: 'online' },
      { id: 'ai_fs_yesiqi', name_cn: '全栈工程师', icon: '👩‍💻', title: '全栈工程师', status: 'online' },
      { id: 'ai_fs_fanzhiyuan', name_cn: '全栈工程师', icon: '👨‍💻', title: '全栈工程师', status: 'online' },
      { id: 'ai_fs_luojiayin', name_cn: '全栈工程师', icon: '👩‍💻', title: '全栈工程师', status: 'online' },
      { id: 'ai_fs_qinzixuan', name_cn: '全栈工程师', icon: '👩‍💻', title: '全栈工程师', status: 'online' },
      { id: 'ai_fs_pengzihao', name_cn: '全栈工程师', icon: '👨‍💻', title: '全栈工程师', status: 'online' }
    ];
    fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(defaultEmployees, null, 2), 'utf8');
  }
}

// 读取员工数据
function loadEmployees() {
  ensureDataDir();
  try {
    const data = fs.readFileSync(EMPLOYEES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Employees] 读取员工数据失败:', error.message);
    return [];
  }
}

// 保存员工数据
function saveEmployees(employees) {
  ensureDataDir();
  try {
    fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(employees, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[Employees] 保存员工数据失败:', error.message);
    return false;
  }
}

function registerEmployeesAPI(registerRoute, parseBody) {
  // GET /api/employees - 获取员工列表
  registerRoute('GET', '/api/employees', async (req, res) => {
    try {
      const employees = loadEmployees();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        employees: employees,
        total: employees.length
      }));
    } catch (error) {
      console.error('[Employees API] 获取员工列表失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: '获取员工列表失败: ' + error.message
      }));
    }
  });

  // GET /api/employees/:id - 获取员工详情
  registerRoute('GET', /^\/api\/employees\/(\d+)$/, async (req, res, matches) => {
    try {
      const employeeId = parseInt(matches[1]);
      const employees = loadEmployees();
      const employee = employees.find(e => e.id === employeeId);
      
      if (!employee) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '员工不存在' }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, employee: employee }));
    } catch (error) {
      console.error('[Employees API] 获取员工详情失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '获取员工详情失败: ' + error.message }));
    }
  });

  // POST /api/employees - 创建新员工
  registerRoute('POST', '/api/employees', async (req, res) => {
    try {
      const body = await parseBody(req);
      const { name, role, department, skills } = body;
      
      if (!name || !role) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '缺少必要参数: name, role' }));
        return;
      }
      
      const employees = loadEmployees();
      const newId = employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1;
      
      const newEmployee = {
        id: newId,
        name: name,
        role: role,
        department: department || 'General',
        status: 'offline',
        skills: skills || [],
        createdAt: new Date().toISOString()
      };
      
      employees.push(newEmployee);
      
      if (saveEmployees(employees)) {
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, employee: newEmployee }));
      } else {
        throw new Error('保存员工数据失败');
      }
    } catch (error) {
      console.error('[Employees API] 创建员工失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '创建员工失败: ' + error.message }));
    }
  });

  // PUT /api/employees/:id - 更新员工信息
  registerRoute('PUT', /^\/api\/employees\/(\d+)$/, async (req, res, matches) => {
    try {
      const employeeId = parseInt(matches[1]);
      const body = await parseBody(req);
      
      const employees = loadEmployees();
      const index = employees.findIndex(e => e.id === employeeId);
      
      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '员工不存在' }));
        return;
      }
      
      // 更新员工信息
      employees[index] = {
        ...employees[index],
        ...body,
        id: employeeId, // 防止 ID 被修改
        updatedAt: new Date().toISOString()
      };
      
      if (saveEmployees(employees)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, employee: employees[index] }));
      } else {
        throw new Error('保存员工数据失败');
      }
    } catch (error) {
      console.error('[Employees API] 更新员工失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '更新员工失败: ' + error.message }));
    }
  });

  // DELETE /api/employees/:id - 删除员工
  registerRoute('DELETE', /^\/api\/employees\/(\d+)$/, async (req, res, matches) => {
    try {
      const employeeId = parseInt(matches[1]);
      const employees = loadEmployees();
      const index = employees.findIndex(e => e.id === employeeId);
      
      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '员工不存在' }));
        return;
      }
      
      employees.splice(index, 1);
      
      if (saveEmployees(employees)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, message: '员工已删除' }));
      } else {
        throw new Error('保存员工数据失败');
      }
    } catch (error) {
      console.error('[Employees API] 删除员工失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '删除员工失败: ' + error.message }));
    }
  });

  console.log('[Employees API] 已注册 /api/employees 路由（列表、详情、创建、更新、删除）');
}

module.exports = { registerEmployeesAPI };
