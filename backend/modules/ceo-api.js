/**
 * CEO Permission API Routes (adapted from v3.5)
 */
const { getCEOInstance, CEO_PERMISSIONS } = require('./ceo-permissions');
const ceo = getCEOInstance();

function ceoAPIRoutes(registerRoute, parseBody, json) {

  registerRoute(['GET'], /^\/api\/ceo\/overview$/, function(req, res) {
    try {
      const overview = ceo.getCEOPermissionOverview();
      json(res, { success: true, ...overview });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/check$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!b.agentId || !b.permission) { json(res, { error: 'missing params' }, 400); return; }
      const result = ceo.checkAndLog(b.agentId, b.agentName || 'unknown', b.permission, { action: 'check', resource: b.resource });
      json(res, result);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['GET'], /^\/api\/ceo\/permissions\/([^\/]+)$/, function(req, res, m) {
    try {
      const permissions = ceo.getAgentPermissions(m[1]);
      json(res, { success: true, ...permissions });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/delegate$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!b.fromAgentId || !b.toAgentId || !b.permissions) { json(res, { error: 'missing params' }, 400); return; }
      const result = ceo.delegate(b.fromAgentId, b.toAgentId, b.permissions, { expiresAt: b.expiresAt, reason: b.reason });
      json(res, result);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['DELETE'], /^\/api\/ceo\/delegate\/([^\/]+)$/, async function(req, res, m) {
    try {
      const b = await parseBody(req);
      if (!b.fromAgentId) { json(res, { error: 'missing fromAgentId' }, 400); return; }
      const result = ceo.revokeDelegation(b.fromAgentId, m[1]);
      json(res, result);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['GET'], /^\/api\/ceo\/delegations$/, function(req, res) {
    try {
      const delegations = ceo.getActiveDelegations();
      json(res, { success: true, delegations });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/temp-grant$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!b.agentId || !b.permission || !b.durationMs) { json(res, { error: 'missing params' }, 400); return; }
      const result = ceo.grantTemporaryPermission(b.agentId, b.permission, b.durationMs);
      json(res, result);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/temp-revoke$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!b.agentId || !b.permission) { json(res, { error: 'missing params' }, 400); return; }
      const result = ceo.revokeTemporaryPermission(b.agentId, b.permission);
      json(res, result);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/command$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!b.agentId || !b.command) { json(res, { error: 'missing params' }, 400); return; }
      const { CEOCommandHandler } = require('./ceo-permissions');
      const handler = new CEOCommandHandler(ceo);
      const result = handler.handle(b.agentId, b.command, b.params || {});
      json(res, result);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['GET'], /^\/api\/ceo\/audit$/, function(req, res) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const entries = ceo.getAuditLog({
        agentId: u.searchParams.get('agentId'),
        permission: u.searchParams.get('permission'),
        since: u.searchParams.get('since'),
        limit: parseInt(u.searchParams.get('limit')) || 100
      });
      json(res, { success: true, count: entries.length, entries });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/task\/assign$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!ceo.hasPermission(b.agentId, 'task.assign')) { json(res, { error: 'permission denied' }, 403); return; }
      json(res, { success: true, action: 'task.assigned', taskId: b.taskId, assigneeId: b.assigneeId, assignedBy: b.agentId, assignedAt: new Date().toISOString() });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/task\/bulk-assign$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!ceo.hasPermission(b.agentId, 'task.bulk.assign')) { json(res, { error: 'permission denied' }, 403); return; }
      const results = (b.assignments || []).map(function(a) { return { taskId: a.taskId, assigneeId: a.assigneeId, status: 'assigned' }; });
      json(res, { success: true, assigned: results.length, results: results });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/team\/fire$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!ceo.hasPermission(b.agentId, 'team.fire')) { json(res, { error: 'permission denied' }, 403); return; }
      json(res, { success: true, action: 'agent.terminated', targetAgentId: b.targetAgentId, reason: b.reason || 'CEO decision', terminatedBy: b.agentId, terminatedAt: new Date().toISOString() });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/team\/promote$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!ceo.hasPermission(b.agentId, 'team.promote')) { json(res, { error: 'permission denied' }, 403); return; }
      json(res, { success: true, action: 'agent.promoted', targetAgentId: b.targetAgentId, newLevel: b.newLevel, reason: b.reason || 'excellent', promotedBy: b.agentId, promotedAt: new Date().toISOString() });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['POST'], /^\/api\/ceo\/emergency\/stop$/, async function(req, res) {
    try {
      const b = await parseBody(req);
      if (!ceo.hasPermission(b.agentId, 'emergency.stop.all')) { json(res, { error: 'permission denied' }, 403); return; }
      json(res, { success: true, action: 'emergency_stop_initiated', reason: b.reason || 'CEO emergency', initiatedBy: b.agentId, initiatedAt: new Date().toISOString() });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['GET'], /^\/api\/ceo\/categories$/, function(req, res) {
    try {
      const categories = Object.entries(CEO_PERMISSIONS).map(function(e) { return { id: e[0], name: e[1].name, description: e[1].description, level: e[1].level, permissionCount: e[1].permissions.length }; });
      json(res, { success: true, categories: categories });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

  registerRoute(['GET'], /^\/api\/ceo\/categories\/([^\/]+)$/, function(req, res, m) {
    try {
      const category = CEO_PERMISSIONS[m[1].toUpperCase()];
      if (!category) { json(res, { error: 'category not found' }, 404); return; }
      json(res, { success: true, category: { id: m[1].toUpperCase(), name: category.name, description: category.description, level: category.level, permissions: category.permissions } });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
  });

}

module.exports = { ceoAPIRoutes };
