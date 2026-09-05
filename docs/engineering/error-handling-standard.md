# Error Handling Standard

**Status:** Accepted baseline

## 1. Goals

CartNest errors must be:

- machine-readable;
- safe for users;
- useful for operators;
- consistent across modules;
- traceable with a request ID;
- compatible with the typed API client.

## 2. Public Error Envelope

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "One or more items are no longer available in the requested quantity.",
    "requestId": "req_01...",
    "details": {
      "items": []
    }
  }
}
```

`details` is optional and must never leak secrets, SQL, stack traces, private provider payloads, or unauthorized resource information.

## 3. Error Taxonomy

| Class | Examples | Typical HTTP |
| --- | --- | --- |
| Validation | `VALIDATION_ERROR` | 400 |
| Authentication | `UNAUTHENTICATED`, `SESSION_EXPIRED` | 401 |
| Authorization | `FORBIDDEN`, `VENDOR_SCOPE_DENIED` | 403 |
| Not found | `PRODUCT_NOT_FOUND` | 404 |
| Conflict/business state | `INSUFFICIENT_STOCK`, `ORDER_NOT_CANCELLABLE` | 409 |
| Rate limit | `RATE_LIMITED` | 429 |
| External dependency | `PAYMENT_PROVIDER_UNAVAILABLE` | 502/503 or mapped policy |
| Internal | `INTERNAL_ERROR` | 500 |

Status codes alone are not enough; clients use stable error codes.

## 4. Validation Errors

Validation failures should identify fields in a structured way where safe.

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "requestId": "req_...",
    "details": {
      "fields": [
        {
          "path": "price",
          "code": "MINIMUM",
          "message": "Must be greater than or equal to zero."
        }
      ]
    }
  }
}
```

Do not expose internal TypeBox/AJV implementation details unnecessarily.

## 5. Security-Sensitive Errors

Avoid account/resource enumeration.

Examples:

- password reset may return the same public response whether an account exists or not;
- unauthorized access to another vendor's resource may return `FORBIDDEN` or `NOT_FOUND` according to the security policy;
- login error should not reveal whether email or password was the wrong credential.

## 6. External Provider Errors

Provider errors are normalized.

Bad:

```text
return flutterwaveSdkError directly
```

Good:

```text
provider error
  -> adapter classification
  -> internal log with provider reference
  -> safe domain/API error
```

Preserve provider diagnostic data in protected logs/audit records when appropriate.

## 7. Unknown Errors

Unexpected exceptions:

1. are logged with stack trace server-side;
2. include request ID;
3. return safe `INTERNAL_ERROR`;
4. never return stack traces in production.

## 8. Frontend Handling

The typed client or frontend integration layer should normalize errors into a predictable application error type.

UI behavior should branch on `error.code`, not message text.

Examples:

- `UNAUTHENTICATED` -> sign-in/re-auth flow;
- `INSUFFICIENT_STOCK` -> refresh cart and show affected lines;
- `RATE_LIMITED` -> show retry guidance;
- `PAYMENT_STATUS_UNKNOWN` -> show pending/reconciliation state, not failure.

## 9. Logging Severity

Suggested mapping:

- expected validation/business conflict: info/debug as appropriate;
- unauthorized security anomaly: warn;
- provider outage: warn/error with provider context;
- unexpected exception: error;
- suspected security incident: error/security event.

Avoid treating every 4xx as a server error.

## 10. Error Code Governance

Error codes are part of the API contract.

Rules:

- uppercase snake case;
- stable semantic meaning;
- do not reuse one code for unrelated conditions;
- document new codes in OpenAPI/contract definitions;
- removing/renaming codes may be a breaking change.

## 11. Retry Guidance

Errors should be classified by whether retry is safe.

Examples:

- validation error: not retryable without change;
- rate limit: retry later;
- transient provider unavailable before any financial side effect: potentially retryable;
- payment ambiguous: do not create a second charge; reconcile;
- conflict from stale version: refetch and retry workflow.

## 12. Testing

For critical endpoints, test:

- expected status;
- expected stable code;
- safe message/details;
- no sensitive leakage;
- request ID presence;
- frontend/client handling where relevant.
