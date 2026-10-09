# AI Optimization Report

## 1. Tools and Prompting

I developed this project with the assistance of Claude AI (Anthropic) for selected parts of the development process. I provided the assessment requirements and used Claude to help with parts of the project structure, database schema, triggers, API endpoints, role-based access control, user interface, CSS, and tests.

I also worked on running the application locally, configuring the Neon database, managing the source code through GitHub, and deploying the application on Vercel. After deployment, I tested the live application in the browser using all three roles: Supervisor, Verifier, and Sewing Supervisor.

My approach was to use AI assistance where it was helpful while working through the setup, debugging, deployment, and testing required to get the application running correctly.

## 2. Issues Found and Fixed

During development, I encountered several issues that required changes to the code and configuration.

### Bug 1: Local database initialization failure

The application attempted to open a database file inside the `.data` directory, but the directory had not been created. As a result, requests returned a 500 error. The unit tests did not detect this because they used an in-memory database.

**Fix:** I added logic to create the directory before opening the database.

### Bug 2: Failed database connections could not recover

The database connection promise was stored in a global variable. When the initial connection attempt failed, the rejected promise remained stored, preventing subsequent requests from retrying the connection.

**Fix:** I updated the connection logic to clear the saved promise when a connection attempt fails, allowing a new connection attempt.

### Bug 3: Database setup script did not load environment variables

The `db:setup` script ran outside Next.js, so the `.env` file was not loaded automatically. The original command in the README also needed to work in Windows PowerShell.

**Fix:** I updated the `package.json` script to use `tsx --env-file=.env scripts/setup-db.ts` and revised the README instructions.

### Deployment issues

My first Vercel deployment displayed a server-side application error because `DATABASE_URL` and `AUTH_SECRET` had not been configured in the Vercel environment variables.

I added the required environment variables and redeployed the application.

I also found that Vercel Deployment Protection redirected visitors to a login page. I disabled Vercel Authentication so the application could be accessed for evaluation.

### Limitations identified

I identified several areas that could be improved before using the application in production:

* The demo passwords are included in browser-side JavaScript. This is suitable only for the current demonstration setup and would need to be replaced with a secure authentication approach.
* The Approve action makes two requests: one to save the counts and another to approve the batch. The server validates the data again before approval.
* Login rate limiting has not been implemented.
* The assessment requires whole numbers for quantities and piece counts. These inputs reject decimals, while fabric yard measurements allow up to two decimal places because fabric can be measured in fractions of a yard.

## 3. Human Review, Changes, and Testing

I reviewed the main files, including `verification.ts`, `schema.sql`, and `context.ts`, to understand how the validation rules, database operations, and approval process work.

I configured my local `.env` file with the database URL and authentication secret. The file is excluded from Git, and `.env.example` does not contain actual credentials.

I also corrected the database setup command, updated the README deployment instructions, and configured the application for deployment.

After deployment, I tested the live application using all three roles: Supervisor, Verifier, and Sewing Supervisor.

My testing covered the following scenarios:

* Checking that a batch with a shortage cannot be approved.
* Confirming that rejecting a batch requires a reason.
* Verifying that only approved and verified batches appear in the Sewing Queue.
* Refreshing the browser to check whether saved data remains available.
* Checking the behaviour of the role-based permissions and approval workflow.

I also used the database tests in `tests/db-guards.test.ts` to check whether the database prevents invalid operations through raw SQL.

### Implementation decisions

I made several implementation decisions to handle requirements that were not completely clear in the assessment.

* Sewing progress is recorded using `sewing_started_at` and `sewing_started_by` instead of introducing a fifth status. This keeps the Sewing Queue query based on `status = 'VERIFIED'`.
* New orders start with the `IN_PROGRESS` status and are submitted to quality control using a separate Submit to QC button.
* The project uses Drizzle ORM instead of Prisma. This allows the database schema and triggers to be used consistently with Neon and the test database setup.

Claude AI assisted with selected development tasks, while I also worked on understanding the implementation, configuring the environment, resolving issues, and testing the deployed application.

## 4. Defensive Architecture

The application uses three layers of validation and protection to reduce the risk of invalid batch approvals.

### Layer 1: API validation

* The user's role is retrieved from the database on each request. The login token stores only the user ID.
* Requests without authentication return 401, while requests from users without the required permissions return 403.
* Zod validates incoming request data and rejects unexpected fields, preventing clients from directly supplying values such as `verifierId`, `status`, or `timestamp`.
* The API enforces the permitted status transitions.
* Approval is rejected with a 422 response if any component has not been counted or has a RED status.

### Layer 2: Database transactions

* The relevant order row is locked during the approval process.
* The traffic-light status is recalculated using the expected and counted values stored in the database.
* The audit record and status change are saved together in a single transaction.
* The verifier ID is obtained from the authenticated session, and the timestamp is generated by the database.

### Layer 3: Database protection

* Database triggers prevent invalid status transitions.
* A trigger blocks a batch from becoming `VERIFIED` unless the required approval record exists and all components have been counted without any RED items.
* Audit records can only be added to; updates and deletes are rejected.
* Once an order is verified, its status and counts cannot be changed.

### Sewing Queue protection

The Sewing Queue uses a SQL query that filters records by `status = 'VERIFIED'`. The query does not accept filtering values from the client, preventing URL parameter changes from exposing unverified orders.

### Testing the database protections

The `tests/db-guards.test.ts` test file checks the database restrictions using raw SQL. This helps verify that invalid status changes and prohibited database operations are rejected at the database level, rather than relying only on the user interface.

## 5. Conclusion

I developed this application with some assistance from Claude AI and used it as a tool to support selected parts of the implementation. I also worked on the local setup, database configuration, debugging, deployment, and testing of the application.

Through this process, I gained practical experience with database management, API validation, role-based access control, transaction handling, database triggers, deployment configuration, and testing business rules.

The project also helped me identify areas that need further improvement, particularly production authentication, login rate limiting, and simplifying the approval workflow.
