# Developer Guide & Project Standards (`agents.md`)

Welcome to the **queueLess-Backend** (queue-less) repository! This document serves as the guide for developers and AI agents working on this project. It defines the project context, architectural guidelines, directory structure, coding standards, and standard error/response patterns.

---

## 1. Project Overview

**queue-less** is a modern backend service built to eliminate physical wait times through virtual queueing, ticket generation, and real-time waitlist management.
- **Framework**: [NestJS](https://nestjs.com/) (progressive Node.js framework)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [TypeORM](https://typeorm.io/)
- **Authentication**: JWT & Passport (`@nestjs/jwt`, `@nestjs/passport`)
- **Validation**: Declarative validation using `class-validator` and `class-transformer`
- **Pagination**: Standardized pagination using `nestjs-paginate`

---

## 2. Maintainable Folder Structure

To ensure scalability and maintainability, the project follows the modular structure of NestJS:

```text
src/
├── common/                  # Shared utilities, constants, filters, and interceptors
│   ├── constants/           # Global enums, custom error codes, and configuration constants
│   ├── decorators/          # Custom decorators (e.g., @CurrentUser, @Public)
│   ├── dto/                 # Generic and shared Data Transfer Objects
│   ├── exceptions/          # Custom exceptions and error classes
│   ├── filters/             # Global HTTP exception filters
│   └── interceptors/        # Global response transformation interceptors
├── config/                  # Configuration files (database, JWT, environment variables)
├── users/                   # Users domain module (example of a feature module)
│   ├── dto/                 # Feature-specific DTOs (create-user.dto.ts, etc.)
│   ├── entities/            # TypeORM Database Entities (user.entity.ts)
│   ├── users.controller.ts  # HTTP routes handler
│   ├── users.module.ts      # NestJS Module definition
│   ├── users.service.ts     # Domain business logic
│   └── users.service.spec.ts
├── app.controller.ts        # Main application controller
├── app.module.ts            # Root application module
├── main.ts                  # Application entry point
```

### Module Guidelines:
- Keep modules **cohesive** and **loosely coupled**.
- Inject dependencies via constructor dependency injection.
- Domain logic must reside in **services**, while HTTP-level details (status codes, routes, decorators) are handled by **controllers**.

---

## 3. Unified Error and Response Patterns

To maintain consistent communication with the frontend clients, all API responses must follow a strict, standardized format.

### 3.1. Standard Success Response
Every successful API response should wrap its payload in a common structure:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message describing success context"
}
```

### 3.2. Standard Failed/Error Response
Every failed API response (regardless of whether it's a validation error, standard NestJS exception, or custom business rule failure) must follow this format:
```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with the specified ID does not exist.",
    "details": null
  },
  "timestamp": "2026-06-21T10:26:21.000Z",
  "path": "/users/123"
}
```

---

## 4. The "Common" Section (Implementations)

Create the following files under `src/common` to enforce the unified error/success patterns.

### 4.1. Error Codes Enum
Define application-wide machine-readable error codes to help the client application react programmatically.

`src/common/constants/error-codes.ts`:
```typescript
export enum ErrorCode {
  // Generic codes
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Domain specific codes
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  QUEUE_FULL = 'QUEUE_FULL',
  TICKET_EXPIRED = 'TICKET_EXPIRED',
}
```

### 4.2. Custom Base Exception (`class.error` Type)
Use this custom `AppException` class to throw business logic or domain failures gracefully.

`src/common/exceptions/app.exception.ts`:
```typescript
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

export class AppException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly details: any;

  constructor(
    errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details: any = null,
  ) {
    super(message, status);
    this.errorCode = errorCode;
    this.details = details;
  }
}
```

#### How to use it in Services:
```typescript
import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class UsersService {
  async findOne(id: number) {
    const user = await this.userRepository.findOne(id);
    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        `User with ID ${id} not found.`,
        HttpStatus.NOT_FOUND,
      );
    }
    return user;
  }
}
```

### 4.3. Standard Exception Filter
This filter intercepts all exceptions thrown across the application, serializing them into our standardized JSON format.

`src/common/filters/http-exception.filter.ts`:
```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../constants/error-codes';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let details: any = null;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.errorCode;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();
      code = exceptionResponse.error || ErrorCode.BAD_REQUEST;
      message = exceptionResponse.message || exception.message;

      // Capture class-validator validations
      if (Array.isArray(exceptionResponse.message)) {
        code = ErrorCode.VALIDATION_ERROR;
        message = 'Validation failed';
        details = exceptionResponse.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Log unhandled non-HTTP errors
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### 4.4. Response Wrapping Interceptor
An interceptor to automatically wrap all outgoing data payloads inside `{ success: true, data: ... }`.

`src/common/interceptors/transform.interceptor.ts`:
```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data is already in format { success, data } or matches standard structure, bypass
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return {
          success: true,
          data: data ?? null,
        };
      }),
    );
  }
}
```

---

## 5. Setup Checklist (Next Steps)

To active these patterns in the codebase:

1. **Create the files** as described in the `src/common` section.
2. **Register the global interceptor and filter** inside `src/main.ts`:
   ```typescript
   import { NestFactory } from '@nestjs/core';
   import { ValidationPipe } from '@nestjs/common';
   import { AppModule } from './app.module';
   import { HttpExceptionFilter } from './common/filters/http-exception.filter';
   import { TransformInterceptor } from './common/interceptors/transform.interceptor';

   async function bootstrap() {
     const app = await NestFactory.create(AppModule);

     // Prefix all routes with /api/v1 (optional but recommended)
     app.setGlobalPrefix('api/v1');

     // Register Global Validation Pipe
     app.useGlobalPipes(
       new ValidationPipe({
         whitelist: true,
         transform: true,
         forbidNonWhitelisted: true,
       }),
     );

     // Register Global Interceptor
     app.useGlobalInterceptors(new TransformInterceptor());

     // Register Global Exception Filter
     app.useGlobalFilters(new HttpExceptionFilter());

     await app.listen(process.env.PORT ?? 3000);
   }
   bootstrap();
   ```

---

## 6. Coding Workflow Rules

- **Use DTOs**: Never accept arbitrary objects from client payloads. Always define a DTO class decorated with validation rules from `class-validator`.
- **Entities**: Keep TypeORM database logic in entities and repositories.
- **Fail Early**: Throw `AppException` as soon as business rules are violated to avoid deep nesting of conditional structures.
- **Type Safety**: Avoid using `any`. Always declare return types for services, controllers, and helpers.
