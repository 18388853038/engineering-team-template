import { createApp, reactive } from 'vue'
import { t as __t, setLang as __setLang, getLang as __getLang } from './i18n.js'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './assets/style.css'

export const API = reactive({
  base: '',
  token: localStorage.getItem('token') || '',
  get(path) {
    return fetch(this.base + path, {
      headers: this.token ? { Authorization: '***' + this.token } : {}
    }).then(r => r.json())
  },
  post(path, data) {
    return fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: '***' + this.token } : {}) },
      body: JSON.stringify(data)
    }).then(r => r.json())
  },
  put(path, data) {
    return fetch(this.base + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: '***' + this.token } : {}) },
      body: JSON.stringify(data)
    }).then(r => r.json())
  },
  del(path) {
    return fetch(this.base + path, {
      method: 'DELETE',
      headers: this.token ? { Authorization: '***' + this.token } : {}
    }).then(r => r.json())
  },
  setToken(t) {
    this.token = t
    if (t) localStorage.setItem('token', t)
    else localStorage.removeItem('token')
  }
})

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/setup', component: () => import('./views/Setup.vue') },
  { path: '/dashboard', component: () => import('./views/Dashboard.vue'), meta: { auth: true } },
  { path: '/employees', component: () => import('./views/Employees.vue'), meta: { auth: true } },
  { path: '/chat', component: () => import('./views/Chat.vue'), meta: { auth: true } },
  { path: '/tasks', component: () => import('./views/Tasks.vue'), meta: { auth: true } },
  { path: '/profile', component: () => import('./views/Profile.vue'), meta: { auth: true } },
  { path: '/settings', component: () => import('./views/Settings.vue'), meta: { auth: true } },
  { path: '/skills', component: () => import('./views/Skills.vue'), meta: { auth: true } },
  { path: '/files', component: () => import('./views/Files.vue'), meta: { auth: true } },
  { path: '/automation', component: () => import('./views/Automation.vue'), meta: { auth: true } },
  { path: '/health', component: () => import('./views/Health.vue'), meta: { auth: true } },
  { path: '/harness', component: () => import('./views/Harness.vue'), meta: { auth: true } },
  { path: '/audit', component: () => import('./views/Audit.vue'), meta: { auth: true } },
  { path: '/boundary', component: () => import('./views/Boundary.vue'), meta: { auth: true } },
  { path: '/dag', component: () => import('./views/DAGView.vue'), meta: { auth: true } },
  { path: '/plugins', component: () => import('./views/Plugins.vue'), meta: { auth: true } },
  { path: '/abtest', component: () => import('./views/ABTest.vue'), meta: { auth: true } },
  { path: '/ceo', component: () => import('./views/CEOPermissions.vue'), meta: { auth: true } },
  { path: '/file-permissions', component: () => import('./views/FilePermissions.vue'), meta: { auth: true } },
  { path: '/memory', component: () => import('./views/Memory.vue'), meta: { auth: true } },
  { path: '/habits', component: () => import('./views/Habits.vue'), meta: { auth: true } },
  { path: '/workflows', component: () => import('./views/WorkflowEditor.vue'), meta: { auth: true } },
  { path: '/mcp', component: () => import('./views/MCPManager.vue'), meta: { auth: true } },
]

const router = createRouter({ history: createWebHistory(), routes })

import { translateDOM } from './i18n.js'
router.afterEach(function() { setTimeout(translateDOM, 300); });



// First-run redirect: check setup status
var _setupChecked = false;
var _tokenValidated = false;
router.beforeEach(function(to, from, next) {
  // Public paths: always allow
  if (to.path === '/setup' || to.path === '/login') { next(); return; }
  // No token at all: redirect to login
  if (!API.token) { next('/login'); return; }
  // If autoLogin already validated the token, skip re-validation
  if (window.__autoLoginSkipped) { window.__autoLoginSkipped = false; next(); return; }
  // Validate token with server on first navigation
  if (!_tokenValidated) {
    _tokenValidated = true;
    fetch(API.base + '/api/auth/me', {
      headers: { Authorization: '***' + API.token }
    }).then(function(r) {
      if (r.ok) {
        // Token valid, proceed with setup check
        return fetch(API.base + '/api/setup/status').then(function(r2) { return r2.json(); });
      } else {
        // Token invalid, clear and redirect to login
        API.setToken('');
        next('/login');
        throw new Error('token invalid');
      }
    }).then(function(d) {
      if (d && d.ok && !d.configured) { next('/setup'); } else { next(); }
    }).catch(function() { next(); });
    return;
  }
  next();
});
const app = createApp(App)
const __map = {navDashboard:'nav.dashboard',navChat:'nav.chat',navEmployees:'nav.employees',navTasks:'nav.tasks',navProfile:'nav.profile',navSettings:'nav.settings',navSkills:'nav.skills',navFiles:'nav.files',navAutomation:'nav.automation',navHealth:'nav.health',navHarness:'nav.harness',navLogout:'nav.logout',navCore:'nav.core',navSystem:'nav.system',navAudit:'nav.audit',navBoundary:'nav.boundary',navDag:'nav.dag',navPlugins:'nav.plugins',navAbtest:'nav.abtest',dashboardTitle:'dashboard.title',dashboardTagline:'dashboard.tagline',dashboardEmployees:'dashboard.employees',dashboardOnline:'dashboard.online',dashboardTasks:'dashboard.tasks',dashboardDone:'dashboard.done',dashboardServerRunning:'dashboard.serverRunning',dashboardServerError:'dashboard.serverError',dashboardRunning:'dashboard.uptime',dashboardPending:'dashboard.pending',dashboardCeoStatus:'dashboard.ceoStatus',dashboardCeoOnline:'dashboard.ceoOnline',dashboardCeoOffline:'dashboard.ceoOffline',dashboardTraffic:'dashboard.traffic',dashboardTotal:'dashboard.total',dashboardSuccess:'dashboard.success',dashboardFailed:'dashboard.failed',dashboardInputTokens:'dashboard.inputTokens',dashboardOutputTokens:'dashboard.outputTokens',dashboardCost:'dashboard.cost',dashboardChannels:'dashboard.channels',dashboardCoreValues:'dashboard.coreValues',dashboardCoreTeam:'dashboard.coreTeam',dashboardStatus:'dashboard.status',dashboardSkills:'dashboard.skills',channelConnected:'channel.connected',channelDisconnected:'channel.disconnected',channelChecking:'channel.checking',channelConfigure:'channel.configure',channelSetup:'channel.setup',channelGuide:'channel.guide',appSub:'app.sub',appVersion:'app.version',empCount:'app.sub',all:'common.all',search:'common.search',status:'common.status',name:'common.name',online:'common.online',offline:'common.offline',loading:'common.loading',valueCollaboration:'value.collaboration',valueIntelligence:'value.intelligence',valueSecurity:'value.security',valueEfficiency:'value.efficiency',noActivity:'common.noActivity',dashboardActivities:'dashboard.activities',dashboardQuickActions:'dashboard.quickActions',dashboardChatStart:'dashboard.chatStart',dashboardViewTasks:'dashboard.viewTasks',dashboardBrowseEmployees:'dashboard.browseEmployees',dashboardSystemSettings:'dashboard.systemSettings',chatSearch:'chat.search',chatNoMatch:'chat.noMatch',chatSend:'chat.send',chatPlaceholder:'chat.placeholder',chatThinking:'chat.thinking',chatSelectAgent:'chat.selectAgent',empScoreRank:'employee.scoreRank',empListView:'employee.listView',empName:'employee.name',empTitle:'employee.title',empScore:'employee.score',empDone:'employee.done',empTotal:'employee.total',empRate:'employee.rate',empScoreDesc:'employee.scoreDesc',healthServer:'health.server',healthUptime:'health.uptime',healthVersion:'health.version',healthMemory:'health.memory',healthDatabase:'health.database',fileMgr:'file.manager',fileDesc:'file.desc',fileNew:'file.new',fileRoot:'file.root',fileParent:'file.parent',fileFile:'file.file',fileFolder:'file.folder',fileCreateBtn:'file.create',fileCancel:'file.cancel',fileEmpty:'file.empty',fileClose:'file.close',fileConfirmDel:'file.confirmDel',fileDelWarn:'file.delWarn',settingsTitle:'settings.title',settingsDesc:'settings.desc',settingsAiModel:'settings.aiModel',settingsSelectProvider:'settings.selectProvider',settingsConfigured:'settings.configured',settingsNotConfigured:'settings.notConfigured',settingsTestConnection:'settings.testConnection',settingsTesting:'settings.testing',settingsConnectionOk:'settings.connectionOk',settingsConnectionFail:'settings.connectionFail',settingsModelConfig:'settings.modelConfig',settingsChannelConfig:'settings.channelConfig',settingsProviderKey:'settings.providerKey',settingsSaveConfig:'settings.saveConfig',settingsConfigSaved:'settings.configSaved',harnessTitle:'harness.title',harnessDesc:'harness.desc',harnessRealtime:'harness.realtime',harnessOffline:'harness.offline',harnessUpdated:'harness.updated',harnessRefresh:'harness.refresh',harnessTaskRate:'harness.taskRate',harnessTokenUsage:'harness.tokenUsage',harnessErrorRate:'harness.errorRate',harnessRetention:'harness.retention',harnessPendingCases:'harness.pendingCases',harnessAlerts:'harness.alerts',harnessTabOverview:'harness.tabOverview',harnessTabMetrics:'harness.tabMetrics',harnessTabErrors:'harness.tabErrors',harnessTabLeaderboard:'harness.tabLeaderboard',harnessTabCost:'harness.tabCost',harnessTabRetention:'harness.tabRetention',harnessTabSink:'harness.tabSink',harnessSystemHealth:'harness.systemHealth',harnessCompletionRate:'harness.completionRate',harnessErrorRateSmall:'harness.errorRateSmall',harnessRoundCalls:'harness.roundCalls',harnessFee:'harness.fee',harnessNoToolData:'harness.noToolData',harnessTool:'harness.tool',harnessCalls:'harness.calls',harnessErrors:'harness.errors',harnessErrorPct:'harness.errorPct',harnessLatency:'harness.latency',harnessErrorClassification:'harness.errorClassification',harnessType:'harness.type',harnessSeverity:'harness.severity',harnessCount:'harness.count',harnessRatio:'harness.ratio',harnessUnknownPending:'harness.unknownPending',harnessEmployeeRanking:'harness.employeeRanking',harnessRankFormula:'harness.rankFormula',harnessRank:'harness.rank',harnessName:'harness.name',harnessScore:'harness.score',harnessKeepRate:'harness.keepRate',harnessCostEstimate:'harness.costEstimate',harnessInputTokens:'harness.inputTokens',harnessOutputTokens:'harness.outputTokens',harnessTotalCost:'harness.totalCost',harnessRetentionEfficiency:'harness.retentionEfficiency',harnessRedoRate:'harness.redoRate',harnessTotalTasks:'harness.totalTasks',harnessCompleted:'harness.completed',harnessFailed:'harness.failed',harnessFeatureRanking:'harness.featureRanking',harnessNoUsageData:'harness.noUsageData',harnessDailyTrend:'harness.dailyTrend',harnessNoTrendData:'harness.noTrendData',harnessSinkCases:'harness.sinkCases',harnessTotalCases:'harness.totalCases',harnessOpenCases:'harness.openCases',harnessResolveRate:'harness.resolveRate',harnessRecentCases:'harness.recentCases',harnessNoCases:'harness.noCases',setupTitle:'setup.title',setupWelcome:'setup.welcome',setupDesc:'setup.desc',setupStep1:'setup.step1',setupStep2:'setup.step2',setupStep3:'setup.step3',setupStep4:'setup.step4',setupNext:'setup.next',setupPrev:'setup.prev',setupFinish:'setup.finish',setupConfigureProvider:'setup.configureProvider',setupEnterApiKey:'setup.enterApiKey',setupEnterName:'setup.enterName',setupEnterTitle:'setup.enterTitle',setupEnterEmail:'setup.enterEmail',setupSetupComplete:'setup.setupComplete',setupGotoDashboard:'setup.gotoDashboard',setupStartChat:'setup.startChat',setupBrowseEmployees:'setup.browseEmployees',setupFeature1:'setup.feature1',setupFeature2:'setup.feature2',setupFeature3:'setup.feature3',setupFeature4:'setup.feature4',automationTitle:'automation.title',automationDesc:'automation.desc',automationTaskName:'automation.taskName',automationSchedule:'automation.schedule',automationLastRun:'automation.lastRun',automationNextRun:'automation.nextRun',automationEnabled:'automation.enabled',automationDisabled:'automation.disabled',automationRunNow:'automation.runNow',profileTitle:'profile.title',profileInfo:'profile.info',profileName:'profile.name',profileTitle2:'profile.title2',profileEmail:'profile.email',profileBio:'profile.bio',profilePhone:'profile.phone',profileSave:'profile.save',profileSaved:'profile.saved',profileTheme:'profile.theme',profileLanguage:'profile.language',profileAccountInfo:'profile.accountInfo',profileDesc:'profile.desc',profileSaving:'profile.saving',profileContact:'profile.contact',profilePreferences:'profile.preferences',profileIcon:'profile.icon',profileEmojiHint:'profile.emojiHint',profileNameEn:'profile.nameEn',profileAdmin:'profile.admin',profileAdminFull:'profile.adminFull',profileCreatedAt:'profile.createdAt',profileSystemName:'profile.systemName',profileLicenseStatus:'profile.licenseStatus',profileLicenseLocal:'profile.licenseLocal',profileDevAccount:'profile.devAccount',profileDevAccountDesc:'profile.devAccountDesc',profileThemeDark:'profile.themeDark',profileThemeLight:'profile.themeLight',profileThemeAuto:'profile.themeAuto',profileBioPlaceholder:'profile.bioPlaceholder',tasksTitle:'tasks.title',tasksNewTask:'tasks.newTask',tasksTaskTitle:'tasks.taskTitle',tasksDescription:'tasks.description',tasksAssignee:'tasks.assignee',tasksPriority:'tasks.priority',tasksDeadline:'tasks.deadline',tasksStatus:'tasks.status',tasksCreated:'tasks.created',tasksInProgress:'tasks.inProgress',tasksCompleted:'tasks.completed',tasksNoTasks:'tasks.noTasks',tasksCreate:'tasks.create',tasksCancel:'tasks.cancel',tasksEdit:'tasks.edit',tasksPriorityHigh:'tasks.priorityHigh',tasksPriorityMedium:'tasks.priorityMedium',tasksPriorityLow:'tasks.priorityLow',tasksStatusTodo:'tasks.statusTodo',tasksStatusInProgress:'tasks.statusInProgress',tasksStatusDone:'tasks.statusDone',tasksStatusCancelled:'tasks.statusCancelled',tasksUnassigned:'tasks.unassigned',commonSave:'common.save',boundaryTitle:'boundary.title',boundaryDesc:'boundary.desc',boundaryGlobalLimits:'boundary.globalLimits',boundaryPerMinute:'boundary.perMinute',boundaryPerHour:'boundary.perHour',boundaryPerDay:'boundary.perDay',boundarySaveLimits:'boundary.saveLimits',boundaryToolLimits:'boundary.toolLimits',boundaryAddTool:'boundary.addTool',boundaryAgentList:'boundary.agentList',boundaryRole:'boundary.role',boundaryCalls:'boundary.calls',boundaryLimits:'boundary.limits',boundaryEdit:'boundary.edit',boundaryCustomLimits:'boundary.customLimits',boundaryBlockedTools:'boundary.blockedTools',boundarySave:'boundary.save',boundaryCancel:'boundary.cancel',boundaryRecentViolations:'boundary.recentViolations',boundaryNoViolations:'boundary.noViolations',boundaryViolations:'boundary.violations',boundaryRefresh:'boundary.refresh',boundaryTimesMinute:'boundary.timesMinute',boundaryTimesHour:'boundary.timesHour',boundaryTimesDay:'boundary.timesDay',boundaryToolName:'boundary.toolName',boundaryAgentName:'boundary.agentName',boundaryAction:'boundary.action',boundaryUseDefault:'boundary.useDefault',boundaryLoadingAgents:'boundary.loadingAgents',boundaryEditTitle:'boundary.editTitle',boundaryGlobal:'boundary.global',boundaryTaskQuota:'boundary.taskQuota',boundaryMaxTasks:'boundary.maxTasks',boundaryDailyTasks:'boundary.dailyTasks',boundaryUnlimited:'boundary.unlimited',employeesTitle:'employees.title',employeesAll:'employees.all',employeesOnline:'employees.online',employeesOffline:'employees.offline',employeesSearch:'employees.search',employeesNoMatch:'employees.noMatch',employeesScoreRank:'employees.scoreRank',employeesListView:'employees.listView',employeesScoreRanking:'employees.scoreRanking',employeesNoScoreData:'employees.noScoreData',employeesScoreDist:'employees.scoreDist',employeesPerson:'employees.person',employeesReportsTo:'employees.reportsTo',employeesChat:'employees.chat',employeesSkills:'employees.skills',employeesRadar:'employees.radar',chatUploadFile:'chat.uploadFile',chatVoiceInput:'chat.voiceInput',chatActivity:'chat.activity',chatCollapse:'chat.collapse',chatWaitingActivity:'chat.waitingActivity',chatStopRecording:'chat.stopRecording',chatFileUnit:'chat.fileUnit',healthTitle:'health.title',healthStatus:'health.status',healthRunning:'health.running',healthError:'health.error',healthDesc:'health.desc',healthTodayRequests:'health.todayRequests',healthLicenseStatus:'health.licenseStatus',healthCurrentTier:'health.currentTier',healthValid:'health.valid',healthInvalid:'health.invalid',healthMessage:'health.message',healthTrafficTitle:'health.trafficTitle',healthApiTotal:'health.apiTotal',healthSuccess:'health.success',healthFailed:'health.failed',healthInputTokens:'health.inputTokens',healthOutputTokens:'health.outputTokens',healthCost:'health.cost',healthSystemResources:'health.systemResources',healthMemoryUsage:'health.memoryUsage',healthApiRate:'health.apiRate',healthPerMin:'health.perMin',healthAgentCount:'health.agentCount',healthTaskCount:'health.taskCount',healthSuccessRate:'health.successRate',healthRefresh:'health.refresh',healthDeepCheck:'health.deepCheck',abtestTitle:'abtest.title',abtestDesc:'abtest.desc',abtestNewExperiment:'abtest.newExperiment',abtestExperimentName:'abtest.experimentName',abtestVariantA:'abtest.variantA',abtestVariantB:'abtest.variantB',abtestTrafficSplit:'abtest.trafficSplit',abtestActivate:'abtest.activate',abtestConclude:'abtest.conclude',abtestChooseWinner:'abtest.chooseWinner',abtestDraft:'abtest.draft',abtestRunning:'abtest.running',abtestConcluded:'abtest.concluded',abtestNoExperiments:'abtest.noExperiments',abtestExperiments:'abtest.experiments',abtestRefresh:'abtest.refresh',abtestNewExperimentTitle:'abtest.newExperimentTitle',abtestNamePlaceholder:'abtest.namePlaceholder',abtestModelName:'abtest.modelName',abtestCreate:'abtest.create',abtestCancel:'abtest.cancel',abtestCreated:'abtest.created',abtestActivated:'abtest.activated',abtestWinner:'abtest.winner',abtestVariant:'abtest.variant',abtestCalls:'abtest.calls',abtestSuccessRate:'abtest.successRate',abtestLatency:'abtest.latency',abtestChooseA:'abtest.chooseA',abtestChooseB:'abtest.chooseB',auditTitle:'audit.title',auditDesc:'audit.desc',auditAllActors:'audit.allActors',auditAllActions:'audit.allActions',auditFilterDate:'audit.filterDate',auditRefresh:'audit.refresh',auditNoRecords:'audit.noRecords',auditTotal:'audit.total',auditTarget:'audit.target',auditDetail:'audit.detail',auditPrevPage:'audit.prevPage',auditNextPage:'audit.nextPage',auditResult:'audit.result',auditScore:'audit.score',skillsTitle:'skills.title',skillsDesc:'skills.desc',skillsEnabled:'skills.enabled',skillsDisabled:'skills.disabled',skillsInstall:'skills.install',skillsNoSkills:'skills.noSkills',skillsInstallTitle:'skills.installTitle',skillsInstalling:'skills.installing',skillsUrlPlaceholder:'skills.urlPlaceholder',skillsBrowseMarket:'skills.browseMarket',dagTitle:'dag.title',dagDesc:'dag.desc',dagDagFlow:'dag.dagFlow',dagBlocked:'dag.blocked',dagCycle:'dag.cycle',dagRecalculate:'dag.recalculate',dagExecOrder:'dag.execOrder',dagNoData:'dag.noData',dagRefresh:'dag.refresh',dagTopoOrder:'dag.topoOrder',dagBlockedTasks:'dag.blockedTasks',dagWaitingFor:'dag.waitingFor',pluginsTitle:'plugins.title',pluginsDesc:'plugins.desc',pluginsLoaded:'plugins.loaded',pluginsCustomTools:'plugins.customTools',pluginsReload:'plugins.reload',pluginsEnable:'plugins.enable',pluginsDisable:'plugins.disable',pluginsTestExec:'plugins.testExec',pluginsFrom:'plugins.from',pluginsNoPlugins:'plugins.noPlugins',pluginsNoTools:'plugins.noTools',pluginsLoadedCount:'plugins.loadedCount',pluginsCustomToolsCount:'plugins.customToolsCount',pluginsRefresh:'plugins.refresh',pluginsLoadResult:'plugins.loadResult',pluginsFailed:'plugins.failed',pluginsInstalled:'plugins.installed',pluginsHeaderPlugin:'plugins.headerPlugin',pluginsHeaderVersion:'plugins.headerVersion',pluginsHeaderDesc:'plugins.headerDesc',pluginsHeaderTools:'plugins.headerTools',pluginsHeaderStatus:'plugins.headerStatus',pluginsHeaderAction:'plugins.headerAction',pluginsEnabledCheck:'plugins.enabledCheck',pluginsDisabledCircle:'plugins.disabledCircle'};
// Reactive language version - force re-render on change

var langVer = reactive({ v: 0 });
__onLangChange(function() { langVer.v++; });
app.config.globalProperties.__ = function(k) { langVer.v; return __t(__map[k] || k); }
app.config.globalProperties.$t = function(k, def) { langVer.v; var v = __t(__map[k] || k); return v || def || k; }
app.config.globalProperties.__lang = __getLang
app.config.globalProperties.__setLang = __setLang
app.config.globalProperties.__translate = __translate

// Translation plugin: auto-scan DOM on language change
import { translateDOM as __translate, onLangChange as __onLangChange } from './i18n.js'
__onLangChange(function() { setTimeout(__translate, 100); })
app.use(router).mount('#app')
