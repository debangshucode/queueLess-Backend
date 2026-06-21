# FlowPay API Testing & Verification Guide (`api_testing_guide.md`)

This guide contains copy-pasteable `curl` commands to test all endpoints implemented in the Authentication, Authorization, Tenant & Store Management modules. It details **Positive Test Cases** (success paths) and **Negative Test Cases** (error boundaries, tenant leakage prevention, and RBAC guards validation).

---

## Prerequisites & Environment Setup

Ensure the server is running locally:
```bash
npm run start:dev
```
All endpoints are prefixed with `/api/v1` and run on `http://localhost:3000`.

### Seed Accounts Created on Startup:
1. **Super Admin** (Bypasses tenant validation, holds all permissions):
   - **Email**: `admin@queueless.com`
   - **Password**: `admin123`

---

## 1. Authentication Module (`/auth`)

### 1.1. Merchant Registration
Onboards a new organization and creates the first user with the **`ORGANIZATION`** role.

#### Positive Case: Successful Registration
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "merchantName": "ABC Fashion",
    "merchantEmail": "contact@abcfashion.com",
    "merchantPhone": "+15550101",
    "adminName": "John Doe Admin",
    "adminEmail": "john.doe@abcfashion.com",
    "adminPhone": "+15550102",
    "adminPassword": "password123"
  }'
```

#### Negative Case: Duplicate Email Address (Validation Error)
Run the same command again. Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "USER_ALREADY_EXISTS",
    "message": "User with admin email already exists",
    "details": null
  }
}
```

#### Negative Case: Password Too Short (class-validator check)
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "merchantName": "Bad Pass",
    "merchantEmail": "bad@pass.com",
    "adminName": "John Doe",
    "adminEmail": "john@pass.com",
    "adminPassword": "123"
  }'
```
Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      "Password must be at least 6 characters long"
    ]
  }
}
```

---

### 1.2. Login
Authenticates user and returns an `accessToken` (lasts 15m) and `refreshToken` (lasts 7d).

#### Positive Case: Successful Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@abcfashion.com",
    "password": "password123"
  }'
```
*Save the `accessToken` and `refreshToken` from the response.*

#### Negative Case: Invalid Credentials
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@abcfashion.com",
    "password": "wrongpassword"
  }'
```
Expected response (`401 Unauthorized`):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

---

### 1.3. Refresh Token Rotation
Rotates tokens by revoking the used refresh token and issuing a brand new pair.

#### Positive Case: Successful Rotation
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<YOUR_REFRESH_TOKEN>"
  }'
```
*This invalidates the old refresh token and returns a new pair.*

#### Negative Case: Replay Attack (Using Revoked Refresh Token)
Re-run the exact same refresh command with the token you just rotated. Expected response (`401 Unauthorized`):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Refresh token is invalid or expired"
  }
}
```

---

### 1.4. Logout
Revokes the refresh token hash to prevent any further session refreshes.

#### Positive Case: Revocation
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<ACTIVE_REFRESH_TOKEN>"
  }'
```

---

### 1.5. Forgot Password
Triggers the recovery link (logged to console since it is mocked).

#### Positive Case: Initiate Recovery
```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@abcfashion.com"
  }'
```
Check your server terminal. You will see:
```text
[MOCK EMAIL SERVICE] Password Reset Request for: john.doe@abcfashion.com
[MOCK EMAIL SERVICE] Link: http://localhost:3000/api/v1/auth/change-password?token=...
```

---

### 1.6. Change Password (Guarded)
Updates active credentials.

#### Positive Case: Successful Update
```bash
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "oldPassword": "password123",
    "newPassword": "newsecurepassword123"
  }'
```

#### Negative Case: Incorrect Old Password
```bash
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "oldPassword": "badpassword",
    "newPassword": "newsecurepassword123"
  }'
```
Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Old password is incorrect"
  }
}
```

---

## 2. Organization Management (`/organizations`)

### 2.1. View Organization Details

#### Positive Case: Super Admin Accessing Any Organization
```bash
# Login as Super Admin (admin@queueless.com / admin123) and fetch John Doe's org ID.
curl -X GET http://localhost:3000/api/v1/organizations/<ORG_ID> \
  -H "Authorization: Bearer <SUPER_ADMIN_ACCESS_TOKEN>"
```

#### Negative Case: Tenant Boundary Violation (Organization Owner accessing another Tenant Organization)
Register a second merchant (e.g. XYZ Stores), login as XYZ Owner, and attempt to fetch ABC Fashion's organization ID. Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "Access Denied: Cannot view other organization"
  }
}
```

---

## 3. Store Management (`/stores`)

### 3.1. Create Store

#### Positive Case: Organization Owner creating Store
```bash
curl -X POST http://localhost:3000/api/v1/stores \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Park Street Branch",
    "code": "PARK-001",
    "address": "Park Street, Building A",
    "phone": "+15559090"
  }'
```

#### Negative Case: Unauthorized Role Attendant Attempting Store Creation (RBAC Guard)
Create an Attendant user (see section 4), login as Attendant, and attempt store creation. Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "You do not have the required permissions to access this resource",
    "details": {
      "requiredPermissions": [
        "store.create"
      ]
    }
  }
}
```

---

### 3.2. List Stores

#### Positive Case: List Stores (Implicitly Filtered to Current Tenant)
Login as ABC Fashion Owner and trigger:
```bash
curl -X GET http://localhost:3000/api/v1/stores \
  -H "Authorization: Bearer <ABC_FASHION_ORGANIZATION_TOKEN>"
```
*Output will contain ONLY stores belonging to ABC Fashion.*

#### Negative Case: Tenant Boundary Attack (Injecting Other Tenant's ID in query params)
Try to pass another organization ID in query parameters:
```bash
curl -X GET http://localhost:3000/api/v1/stores?organizationId=<XYZ_ORGANIZATION_ID> \
  -H "Authorization: Bearer <ABC_FASHION_ORGANIZATION_TOKEN>"
```
Expected response (`403 Forbidden` by `TenantInterceptor`):
```json
{
  "success": false,
  "error": {
    "code": "TENANT_MISMATCH",
    "message": "Query forbidden: Organization ID mismatch"
  }
}
```

---

### 3.3. Store Soft Delete

#### Positive Case: Delete Store
```bash
curl -X DELETE http://localhost:3000/api/v1/stores/<STORE_ID> \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>"
```

#### Negative Case: Accessing Soft Deleted Store
Attempt to retrieve the soft-deleted store by ID. Expected response (`404 Not Found`):
```json
{
  "success": false,
  "error": {
    "code": "STORE_NOT_FOUND",
    "message": "Store not found or access denied"
  }
}
```

---

## 4. User Management (`/users`)

### 4.1. Create User

#### Positive Case: Organization Owner creating an Attendant User
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Attendant",
    "email": "alice@abcfashion.com",
    "phone": "+15554444",
    "password": "attendantpass123",
    "roleName": "ATTENDANT"
  }'
```

#### Negative Case: Assigning SUPER_ADMIN Role (Security Check)
An Organization Owner attempts to create a Super Admin.
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fake Super Admin",
    "email": "fake.admin@abcfashion.com",
    "password": "password123",
    "roleName": "SUPER_ADMIN"
  }'
```
Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "Cannot assign SUPER_ADMIN role"
  }
}
```

#### Negative Case: Manager Attempting to Create User (RBAC Guard check)
According to the MVP validation matrix, Managers do **not** have permissions to create users (employees).
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <MANAGER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Attendant by Manager",
    "email": "attendant2@abcfashion.com",
    "password": "password123",
    "roleName": "ATTENDANT"
  }'
```
Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "You do not have the required permissions to access this resource",
    "details": {
      "requiredPermissions": [
        "user.create"
      ]
    }
  }
}
```

---

### 4.2. Deactivation & Deactivated User Login

#### Positive Case: Deactivate an Attendant User
```bash
curl -X PATCH http://localhost:3000/api/v1/users/<ALICE_USER_ID>/deactivate \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>"
```

#### Negative Case: Login with Deactivated Credentials
Alice attempts to login after deactivation.
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@abcfashion.com",
    "password": "attendantpass123"
  }'
```
Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "Your account is deactivated or suspended"
  }
}
```

#### Negative Case: Self-Deactivation Block
An Organization Owner attempts to deactivate themselves.
```bash
curl -X PATCH http://localhost:3000/api/v1/users/<ORGANIZATION_USER_ID>/deactivate \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>"
```
Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cannot deactivate your own account"
  }
}
```

---

### 4.3. Status Management & Deletion

#### Positive Case: Enable/Change User Status (e.g., set to SUSPENDED)
```bash
curl -X PATCH http://localhost:3000/api/v1/users/<ALICE_USER_ID>/status \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SUSPENDED"
  }'
```

#### Positive Case: Delete User Account Permanently
```bash
curl -X DELETE http://localhost:3000/api/v1/users/<ALICE_USER_ID> \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>"
```

---

### 4.4. Custom Roles & Permissions (Scopes) Creation

#### Positive Case: Create Custom Permission Scope
```bash
curl -X POST http://localhost:3000/api/v1/users/permissions \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "billing.discount",
    "description": "Allows applying discount percentages to checkout invoices"
  }'
```

#### Positive Case: Create Custom Role with bound Scope permissions
```bash
curl -X POST http://localhost:3000/api/v1/users/roles \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SENIOR_CASHIER",
    "description": "Attendant with billing.discount permission",
    "permissionNames": [
      "invoice.create",
      "payment.take",
      "billing.discount"
    ]
  }'
```

---

### 4.5. Roles Suggestion API

#### Positive Case: Get suggestion list of roles (excludes SUPER_ADMIN for non-superadmins)
```bash
curl -X GET http://localhost:3000/api/v1/users/roles/suggestions \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>"
```
Expected response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "name": "ORGANIZATION",
      "description": "..."
    },
    {
      "id": "uuid-2",
      "name": "MANAGER",
      "description": "..."
    },
    {
      "id": "uuid-3",
      "name": "ATTENDANT",
      "description": "..."
    },
    {
      "id": "uuid-4",
      "name": "SECURITY",
      "description": "..."
    },
    {
      "id": "uuid-5",
      "name": "SENIOR_CASHIER",
      "description": "..."
    }
  ]
}
```

---

## 5. Product & Category Catalog (`/products`)

### 5.1. Create Product Category
#### Positive Case: Merchant Owner creates a Category
```bash
curl -X POST http://localhost:3000/api/v1/products/categories \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Apparel & Accessories",
    "description": "All clothes, shirts, pants, and wearables"
  }'
```

#### Negative Case: Attendant attempts to create Category (Insufficient Role Permissions)
```bash
curl -X POST http://localhost:3000/api/v1/products/categories \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid Category"
  }'
```
Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "You do not have the required permissions to access this resource"
  }
}
```

### 5.2. Create Product (Manual)
#### Positive Case: Merchant creates a Product with Inventory Tracking Enabled
```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Blue Denim Shirt",
    "sku": "BLUE-SHIRT-M",
    "barcode": "890100200300",
    "price": 29.99,
    "inventoryEnabled": true,
    "initialStock": 50,
    "description": "Denim medium blue color shirt"
  }'
```

#### Negative Case: Duplicate SKU within Organization Boundary
Create a product with the same SKU `"BLUE-SHIRT-M"`. Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Product with SKU BLUE-SHIRT-M already exists"
  }
}
```

### 5.3. Bulk Import Catalog (CSV / Excel)
#### Positive Case: Merchant uploads CSV/Excel containing product records
```bash
# Upload a product spreadsheet containing SKU, name, price, barcode, and optional category/stock
curl -X POST http://localhost:3000/api/v1/products/import \
  -H "Authorization: Bearer <ORGANIZATION_ACCESS_TOKEN>" \
  -F "file=@products_sheet.csv"
```

### 5.4. Fuzzy Search & Barcode Lookup
#### Positive Case: Search products
```bash
curl -X GET http://localhost:3000/api/v1/products/search?q=Denim \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>"
```

#### Positive Case: Scan/Lookup barcode exact match
```bash
curl -X GET http://localhost:3000/api/v1/products/barcode/890100200300 \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>"
```

---

## 6. Inventory Management (`/inventory`)

### 6.1. Adjust Stock Levels (Restricted to Managers / Owners)
#### Positive Case: Manager adds purchase stock
```bash
curl -X POST http://localhost:3000/api/v1/inventory/adjust \
  -H "Authorization: Bearer <MANAGER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<PRODUCT_UUID>",
    "type": "PURCHASE",
    "quantity": 25,
    "remarks": "Received new shipment batch"
  }'
```

#### Negative Case: Attendant attempts manual stock adjustment (Insufficient Scope)
```bash
curl -X POST http://localhost:3000/api/v1/inventory/adjust \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<PRODUCT_UUID>",
    "type": "ADJUSTMENT",
    "quantity": 10
  }'
```
Expected response (`403 Forbidden`):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_RESOURCE",
    "message": "You do not have the required permissions to access this resource"
  }
}
```

### 6.2. Query Stock Status & Audit Trail
#### Positive Case: Query stock level
```bash
curl -X GET http://localhost:3000/api/v1/inventory/product/<PRODUCT_UUID> \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>"
```

#### Positive Case: Query transaction logs audit history (Manager / Owner only)
```bash
curl -X GET http://localhost:3000/api/v1/inventory/product/<PRODUCT_UUID>/transactions \
  -H "Authorization: Bearer <MANAGER_ACCESS_TOKEN>"
```

---

## 7. Customer Shopping Sessions (`/sessions`)

### 7.1. Initialize Shopping Session Cart
#### Positive Case: Attendant starts a session
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "VIP-99"
  }'
```
*Save the returned `id` as `<SESSION_UUID>`.*

### 7.2. Populate Cart Items (Collaborative additions)
#### Positive Case: Attendant adds items to cart
```bash
curl -X POST http://localhost:3000/api/v1/sessions/<SESSION_UUID>/items \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<PRODUCT_UUID>",
    "quantity": 2
  }'
```
*Notice that repeating this call increments the quantity on the same product row, and updates `addedByUserId` to the active actor.*

### 7.3. Edit Cart Item Quantity
#### Positive Case: Adjust quantity manually
```bash
curl -X PATCH http://localhost:3000/api/v1/sessions/<SESSION_UUID>/items/<PRODUCT_UUID> \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 5
  }'
```

### 7.4. Delete Cart Item
#### Positive Case: Remove product from cart
```bash
curl -X DELETE http://localhost:3000/api/v1/sessions/<SESSION_UUID>/items/<PRODUCT_UUID> \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>"
```

---

## 8. Invoice Generation (`/invoices`)

### 8.1. Create Invoice Snapshot
#### Positive Case: Attendant triggers checkout and generates static invoice
```bash
curl -X POST http://localhost:3000/api/v1/invoices \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<SESSION_UUID>",
    "discountAmount": 5.00,
    "taxAmount": 4.50
  }'
```
Expected response: Returns static `Invoice` containing a snapshot of items (preserving unitPrice, SKU, barcodes at checkout time) and transitions Session status to `CHECKED_OUT`. Save invoice `<INVOICE_UUID>`.

#### Negative Case: Attendant attempts to checkout an already checked-out Session
Run the same command again. Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Session is already in status CHECKED_OUT"
  }
}
```

---

## 9. Payments Collection (`/payments`)

### 9.1. Settle Pending Invoices & Side-Effect Stock
#### Positive Case: Settle invoice via CASH / CARD / UPI
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "<INVOICE_UUID>",
    "method": "UPI",
    "amount": <EXACT_INVOICE_TOTAL_AMOUNT>,
    "transactionReference": "TXN-998877"
  }'
```
Expected response: Returns payment confirmation.
*System Side-Effects Verified:*
1. Invoice status transitions to `PAID`.
2. For all cart items with `inventoryEnabled = true`, negative-quantity `SALE` transactions are recorded in the transaction history.
3. The cache `Inventory.currentQuantity` is adjusted down automatically.

#### Negative Case: Payment Amount Mismatch
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer <ATTENDANT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "<INVOICE_UUID>",
    "method": "CASH",
    "amount": 99999.00
  }'
```
Expected response (`400 Bad Request`):
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Payment amount (99999.00) does not match invoice total amount (...)"
  }
}
```

---

## 10. Performance Analytics (`/analytics`)

### 10.1. Attendants' Billing Contributions
#### Positive Case: Fetch performance dashboards (restricted to Managers / Owners)
```bash
curl -X GET http://localhost:3000/api/v1/analytics/performance \
  -H "Authorization: Bearer <MANAGER_ACCESS_TOKEN>"
```
Expected response: Returns the breakdown of contributions grouped by employee:
```json
{
  "success": true,
  "data": [
    {
      "employeeId": "<USER_UUID>",
      "employeeName": "Alice Attendant",
      "employeeEmail": "alice@abcfashion.com",
      "revenueInfluenced": 149.95,
      "itemsAdded": 5,
      "sessionsContributed": 1
    }
  ]
}
```
