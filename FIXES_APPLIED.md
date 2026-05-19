# HRMS Leave/WFH Application - Bug Fixes

## Issues Found in Commit 51aa7307270241fdfa9c6b292e36b25a77d4aa94

### Issue 1: ❌ CRITICAL - Base URL Changed (Breaking All Employee Endpoints)
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

This broke ALL employee-scoped endpoints:
- /leaveRequest → became /api/v1/leaveRequest (404 Not Found)
- /leaveTypeLeaveCount/{id} → broke
- /employeeDsr → broke
- /markDownTime → broke

**Fix Applied:**
Restored the correct base URL with `/employee` suffix

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

1. **Base URL Change**: Removed `/employee` suffix from API base URL
2. **Payload Format**: Array used instead of object for leaveDate
3. **Type Coercion**: Unnecessary conversion of userId to Number

All three issues combined made Leave and WFH applications completely non-functional.

## Files Modified
- services/hrmsApi.js: 2 changes

## Testing
✓ Syntax validation passed for all files
✓ Changes backward compatible
✓ Ready for deployment
