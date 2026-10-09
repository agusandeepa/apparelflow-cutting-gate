# ApparelFlow ERP – Cutting Operations & Verification System

ApparelFlow ERP is a full-stack application designed to manage cutting operations in garment production. It helps supervisors create cutting orders, allows verifiers to check cut components, and ensures that only verified batches can move to the sewing stage.

The main goal of this project is to prevent incomplete, incorrect, or unverified cutting batches from entering the Sewing Queue. These rules are enforced on the server and at the database level, rather than relying only on frontend validation.

**Live Demo:** https://apparelflow-cutting-gate-d2od-pi.vercel.app

## Tech Stack

* Next.js 15 (App Router)
* TypeScript
* PostgreSQL (Neon)
* Drizzle ORM
* JWT authentication with HTTP-only cookies
* Zod for input validation
* Tailwind CSS
* Vitest and PGlite for testing

## Demo Accounts

You can use the demo accounts below to explore the system with different roles.

| Role               | Email                                                             | Password       |
| ------------------ | ----------------------------------------------------------------- | -------------- |
| Cutting Supervisor | [supervisor@apparelflow.demo](mailto:supervisor@apparelflow.demo) | Supervisor@123 |
| Cutting Verifier   | [verifier@apparelflow.demo](mailto:verifier@apparelflow.demo)     | Verifier@123   |
| Sewing Supervisor  | [sewing@apparelflow.demo](mailto:sewing@apparelflow.demo)         | Sewing@123     |

The login page also includes demo login buttons. You can switch between personas using the dropdown in the navigation bar.

## Main Features

### Cutting Order Management

* Create cutting orders using predefined garment recipes.
* Calculate expected component quantities based on the production target.
* Record fabric usage and track wastage.
* Validate quantities and display field-level errors.

### Production Batch Verification

* Allow authorized verifiers to inspect cutting batches.
* Compare actual component counts against expected quantities.
* Display GREEN, YELLOW, and RED statuses to make discrepancies easier to identify.
* Prevent approval when components are missing, uncounted, or marked RED.
* Require a valid reason when rejecting a batch.

### Sewing Queue Management

* Display only verified cutting orders in the Sewing Queue.
* Record when sewing starts and which user starts the process.
* Prevent unverified batches from moving into production.

### Authentication and Access Control

* Use JWT-based authentication with HTTP-only cookies.
* Check user roles on the server for every request.
* Restrict actions according to the user's role.
* Keep user identity and timestamps under server-side control.

### Audit Logging

* Record verification decisions, notes, wastage percentages, component differences, and timestamps.
* Keep verification logs append-only.
* Use database triggers to protect audit records and verified orders from unauthorized changes.

## How Verification Works

Each cutting order follows a defined workflow:

1. **In Progress** – The cutting supervisor creates and manages the batch.
2. **Pending Verification** – The batch is submitted for inspection.
3. **Verified** – The verifier approves the batch after checking the component counts.
4. **Rejected** – The verifier rejects the batch and provides a reason. The batch can then be corrected and submitted again.

Once an order is verified, its verification status cannot be changed. Only verified orders are eligible to enter the Sewing Queue.

## Security and Data Validation

Validation is handled on both the server and the database to reduce the risk of invalid requests and unauthorized changes.

The system checks that:

* Only users with the verifier role can approve or reject batches.
* Requests without valid authentication are rejected.
* Component counts are valid whole numbers, with zero allowed to represent a shortage.
* Fabric quantities are positive and limited to two decimal places.
* Rejection notes meet the minimum length requirement.
* Client-supplied roles, verification statuses, and timestamps cannot override trusted server-side values.
* Database triggers block illegal status transitions and unauthorized modifications to protected records.
* Sewing Queue queries return only orders with a `VERIFIED` status.

## Database Design

The application uses PostgreSQL with Drizzle ORM. Its main tables are:

| Table                | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `users`              | Stores user accounts, password hashes, and roles.          |
| `recipes`            | Stores garment recipes and fabric usage limits.            |
| `recipe_components`  | Defines the components required for each garment.          |
| `cutting_orders`     | Stores production targets, fabric usage, and order status. |
| `verification_items` | Records expected and actual component quantities.          |
| `verification_logs`  | Stores verification decisions and audit information.       |

The project includes two sample garment recipes:

* **REC-BL01 – Casual Blouse:** 1.8 yards of standard fabric usage, with a 5% wastage cap.
* **REC-CT02 – Crop Top:** 1.1 yards of standard fabric usage, with an 8% wastage cap.

## Running the Project Locally

### Prerequisites

* Node.js
* npm

### 1. Clone the repository

```bash
git clone <your-github-repository-url>
cd <project-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the application

```bash
npm run dev
```

The application uses an embedded PostgreSQL-compatible database through PGlite for local development, so you can get started without configuring an external database.

### 4. Run the tests

```bash
npm test
```

The test suite contains 47 tests covering business rules, validation, access control, verification, sewing queue restrictions, and database-level protections.

## Using Neon or Supabase

To connect the application to an external PostgreSQL database:

1. Copy `.env.example` to `.env`.
2. Configure `DATABASE_URL` and `AUTH_SECRET`.
3. Run the database setup script.
4. Start the development server.

```bash
npm run db:setup
npm run dev
```

## Testing

The project uses Vitest for automated testing and PGlite to run tests against a PostgreSQL-compatible database with the project's actual schema and triggers.

The tests cover:

* Approval of valid cutting batches.
* Blocking batches with RED or uncounted components.
* Rejection validation and mandatory notes.
* Role-based access control and separation of duties.
* Sewing Queue restrictions and sewing start rules.
* Database protection against invalid status changes and audit log modifications.
* Domain logic, wastage calculations, and input validation.

## Project Structure

```text
src/
├── domain/       # Business rules and state transitions
├── server/       # Services, authentication, and role checks
├── app/
│   ├── api/      # API route handlers
│   └── (app)/    # Role-specific application screens
├── db/           # Database schema, setup, and seed data
tests/            # Automated tests
```

## Deployment

The application is deployed on Vercel and uses Neon PostgreSQL for hosted database storage.

For a new deployment, configure the required environment variables, initialize the database, and deploy the repository through Vercel.

## What I Learned

Building ApparelFlow ERP helped me work with server-side business logic, role-based access control, database constraints, transaction-based validation, and automated testing. It also gave me practical experience designing workflows where data integrity and access permissions are important.

The project focuses on making sure that production rules are enforced consistently across the frontend, backend, and database.
