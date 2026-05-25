// Smoke test for HRMS service functions with a mock HRMS server
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const assert = require('assert');

let lastLeavePayload = null;

async function startMockServer(port = 4000) {
  const app = express();
  app.use(bodyParser.json());

  // Simple ok responder helper
  const ok = (data) => ({ status: true, data });

  app.get('/globalType/leave-type', (req, res) => {
    res.json(ok([{ id: 1, name: 'sick_and_casual_leave' }, { id: 2, name: 'work_from_home' }]));
  });

  app.get('/employee/leaveRequest', (req, res) => {
    res.json(ok([{ id: 101, fromDate: '2026-05-20', toDate: '2026-05-20', leaveType: 'work_from_home' }]));
  });

  app.get('/employee/allEmployee-leave', (req, res) => {
    res.json(ok([]));
  });

  app.get('/employee/attendance-record', (req, res) => {
    res.json(ok({ year: req.query.year || 2026, presentDays: 220 }));
  });

  app.get('/holidays/getAllHolidays', (req, res) => {
    res.json(ok([{ date: '2026-01-01', name: 'New Year' }]));
  });

  app.get('/holidays/getAllCurrentYearHolidays', (req, res) => {
    res.json(ok([{ date: '2026-12-25', name: 'Christmas' }]));
  });

  app.get('/punchLogs/biometric/cal/punches', (req, res) => {
    res.json(ok({ monthCount: req.query.monthCount || 1, punches: [] }));
  });

  app.get('/punchLogs/biometric/punchlogs', (req, res) => {
    res.json(ok([]));
  });

  app.get('/projectInfo', (req, res) => {
    res.json(ok([{ projectId: 'VVPL002', name: 'Test Project' }]));
  });

  app.get('/projectInfo/team/:id', (req, res) => {
    res.json(ok([{ userId: req.params.id, role: 'developer' }]));
  });

  app.get('/employee/leaveTypeLeaveCount/:id', (req, res) => {
    res.json(ok({ userId: Number(req.params.id), balance: { sick: 5, earned: 10 } }));
  });

  app.get('/ticket/active-ticket/:id', (req, res) => {
    res.json(ok([]));
  });

  app.post('/employee/employeeDsr', (req, res) => {
    res.json(ok({ submitted: true, tasks: req.body }));
  });

  app.post('/employee/markDownTime', (req, res) => {
    res.json(ok({ marked: true, payload: req.body }));
  });

  app.post('/ticket/create-ticket', (req, res) => {
    res.json(ok({ ticketId: 555, ...req.body }));
  });

  app.post('/employee/leaveRequest', (req, res) => {
    lastLeavePayload = req.body;
    res.json(ok({ applied: true, payload: req.body }));
  });

  app.post('/leaveRequest', (req, res) => {
    res.json(ok({ applied: true, payload: req.body }));
  });

  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function runTests() {
  process.env.HRMS_API_BASE_URL = 'http://localhost:4000';

  const mock = await startMockServer(4000);
  console.log('[TEST] Mock HRMS server running on port 4000');

  // require services after setting HRMS_API_BASE_URL so they pick up the mock base
  const services = require('../services/hrmsApi');

  const authContext = {
    token: 'dev-token',
    user: { userId: 999, empId: 111 }
  };

  const tests = [
    { name: 'getLeaveContext', fn: () => services.getLeaveContext({ authContext }) },
    { name: 'getAttendance', fn: () => services.getAttendance({ year: 2026, authContext }) },
    { name: 'getHolidays', fn: () => services.getHolidays({ authContext }) },
    { name: 'getCurrentYearHolidays', fn: () => services.getCurrentYearHolidays({ authContext }) },
    { name: 'getPunchReports', fn: () => services.getPunchReports({ monthCount: 1, authContext }) },
    { name: 'getPunchLogs', fn: () => services.getPunchLogs({ authContext }) },
    { name: 'getProjects', fn: () => services.getProjects({ authContext }) },
    { name: 'getProjectTeamReport', fn: () => services.getProjectTeamReport({ userId: 999, authContext }) },
    { name: 'getLeaveTypeLeaveCount', fn: () => services.getLeaveTypeLeaveCount({ userId: 999, authContext }) },
    { name: 'getActiveTickets', fn: () => services.getActiveTickets({ userId: 999, authContext }) },
    { name: 'submitDailyStatusReport', fn: () => services.submitDailyStatusReport({ tasks: [{ projectId: 'VVPL002', taskDetails: 'Test', taskMinutes: 30, taskStatus: 'Inprogress', workingDate: '2026-05-20' }], authContext }) },
    { name: 'markDownTime', fn: () => services.markDownTime({ date: '2026-05-20', departmentId: 131, description: 'Test downtime', endTime: '2026-05-20T12:00:00Z', name: 'Tester', poId: [245], startTime: '2026-05-20T10:00:00Z', subject: 'Test', authContext }) },
    { name: 'createTicket', fn: () => services.createTicket({ assigned_to: 999, description: 'Issue', priority: 'low', title: 'Bug', authContext }) },
    {
      name: 'applyLeave',
      fn: async () => {
        const result = await services.applyLeave({ fromDate: '2026-06-21', toDate: '2026-06-21', leaveReason: 'WFH', leaveType: 'work_from_home', leaveDuration: 'fullDay', authContext });
        assert.strictEqual(lastLeavePayload.dateTime1.slice(0, 10), '2026-06-21');
        assert.strictEqual(lastLeavePayload.dateTime2.slice(0, 10), '2026-06-21');
        return result;
      }
    },
    {
      name: 'applyLeave rejects past date',
      fn: async () => {
        await assert.rejects(
          () => services.applyLeave({ fromDate: '2026-05-01', toDate: '2026-05-01', leaveReason: 'Past', leaveType: 'sick_and_casual_leave', leaveDuration: 'fullDay', authContext }),
          /past dates/
        );
        return { rejected: true };
      }
    }
  ];

  let failed = false;

  for (const t of tests) {
    try {
      console.log(`[TEST] Running ${t.name}...`);
      const r = await t.fn();
      console.log(`[OK] ${t.name}:`, JSON.stringify(r).slice(0, 400));
    } catch (err) {
      failed = true;
      console.error(`[ERR] ${t.name}:`, err.message || err);
    }
  }

  mock.close(() => console.log('[TEST] Mock HRMS server stopped'));

  if (failed) {
    throw new Error('One or more smoke tests failed');
  }
}

runTests().catch((e) => {
  console.error('Smoke tests failed', e);
  process.exit(1);
});
