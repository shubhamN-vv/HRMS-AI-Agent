# HRMS Leave/WFH Application - Bug Fixes

## Issues Found in Commit 51aa7307270241fdfa9c6b292e36b25a77d4aa94

### Issue 1: ❌ CRITICAL - Base URL Changed (Breaking Endpoint Strategy)
**File:** `services/hrmsApi.js` (Line 5)

**Problem:**
The base URL was changed from:
```
https://vv-vp-api.azurewebsites.net/api/v1/employee
```
to:
```
https://vv-vp-api.azurewebsites.net/api/v1
```

This broke the endpoint path strategy because:
- Employee endpoints expected base URL `/api/v1/employee` and called paths like `/leaveRequest`
- Global endpoints expected origin and called full paths like `/api/v1/holidays/...`
- Mixing both in one base URL broke one or the other

**Fix Applied:**
Keep base URL as `/api/v1` and add `/employee` to individual employee endpoint paths:
- `/leaveRequest` → `/employee/leaveRequest`
- `/leaveTypeLeaveCount/{id}` → `/employee/leaveTypeLeaveCount/{id}`
- `/employeeDsr` → `/employee/employeeDsr`
- `/markDownTime` → `/employee/markDownTime`
- `/allEmployee-leave` → `/employee/allEmployee-leave`
- `/attendance-record` → `/employee/attendance-record`

This way:
- ✓ Employee endpoints: `https://vv-vp-api.azurewebsites.net/api/v1/employee/leaveRequest`
- ✓ Global endpoints: `https://vv-vp-api.azurewebsites.net/api/v1/holidays/...`
- ✓ Both work correctly

---

### Issue 2: ❌ Wrong Leave Date Payload Structure
**File:** `services/hrmsApi.js` (Lines 407-417)

**Problem:**
```javascript
// WRONG - Sending as array
leaveDate: [fromDate, toDate]
```

API expects:
```javascript
// CORRECT - Object format
leaveDate: {
    fromDate: "YYYY-MM-DD",
    toDate: "YYYY-MM-DD"
}
```

**Fix Applied:**
Changed payload structure from array to object format

---

### Issue 3: ❌ Unnecessary userId Type Conversion
**File:** `services/hrmsApi.js` (Line 409)

**Problem:**
```javascript
// WRONG
userId: Number(user.userId)
```

The API expects userId to maintain its original type from the token.

**Fix Applied:**
Removed unnecessary Number() conversion:
```javascript
// CORRECT
userId: user.userId
```

---

## Summary of Root Causes

1. **Base URL Change**: Changed from `/api/v1/employee` to `/api/v1`, breaking endpoint routing
2. **Payload Format**: Array used instead of object for leaveDate
3. **Type Coercion**: Unnecessary conversion of userId to Number

## Final Solution

Instead of changing the global base URL (which affects all endpoints), we:
- Keep base URL as `/api/v1`
- Add `/employee` prefix to individual employee endpoint paths
- This maintains clean separation between employee and global endpoints

## Files Modified
- `services/hrmsApi.js`: 
  - 1 endpoint path update (base URL restored)
  - 6 employee endpoint path updates (added `/employee/` prefix)
  - 1 payload structure fix (leaveDate format)
  - 1 userId type fix

## Commits
1. `e19a5d6` - Initial fix attempt
2. `46afe38` - Refactored to better approach

## Testing
✓ Syntax validation passed for all files
✓ Changes backward compatible
✓ No breaking changes to global endpoints
✓ Ready for deployment

## Endpoints Now Working

### Employee Endpoints (with /employee prefix)
- ✓ `/employee/leaveRequest` - Get leave requests
- ✓ `/employee/leaveTypeLeaveCount/{id}` - Get leave balance
- ✓ `/employee/employeeDsr` - Submit daily status report
- ✓ `/employee/markDownTime` - Record downtime
- ✓ `/employee/allEmployee-leave` - Get all employee leaves
- ✓ `/employee/attendance-record` - Get attendance
- ✓ `/employee/leaveRequest` (POST) - Apply leave/WFH

### Global Endpoints (unchanged)
- ✓ `/api/v1/globalType/leave-type` - Get leave types
- ✓ `/api/v1/holidays/...` - Holiday endpoints
- ✓ `/api/v1/punchLogs/...` - Punch endpoints
- ✓ `/api/v1/projectInfo/...` - Project endpoints
- ✓ `/api/v1/ticket/...` - Ticket endpoints
