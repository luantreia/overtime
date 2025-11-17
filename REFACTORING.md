# Overtime API - Refactored Structure

## Overview
This API has been refactored to follow best practices for production-ready Node.js/Express applications with improved security, error handling, logging, and code organization.

## Project Structure

```
overtime-api/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Express middlewares
│   │   ├── authMiddleware.js
│   │   ├── auditMiddleware.js
│   │   ├── errorHandler.js
│   │   ├── requestLogger.js
│   │   └── ...
│   ├── models/           # Mongoose models
│   │   ├── Competencia/
│   │   ├── Equipo/
│   │   ├── Jugador/
│   │   ├── Partido/
│   │   └── ...
│   ├── routes/           # API routes
│   │   ├── Competencias/
│   │   ├── Equipos/
│   │   ├── Jugadores/
│   │   └── ...
│   ├── services/         # Business logic layer
│   │   ├── auditoriaService.js
│   │   ├── equipoService.js
│   │   ├── jugadorService.js
│   │   └── ...
│   ├── utils/            # Utility functions
│   │   ├── logger.js
│   │   ├── jwt.js
│   │   ├── pagination.js
│   │   └── ...
│   └── validators/       # Input validation
│       ├── commonValidators.js
│       ├── equipoValidator.js
│       ├── partidoValidator.js
│       └── userValidator.js
├── swagger/              # API documentation
├── tests/                # Test files
│   └── unit/
├── server.js             # Application entry point
└── package.json
```

## Key Features

### 1. Security Enhancements
- **Helmet**: HTTP security headers
- **Rate Limiting**: Protection against brute-force attacks
- **CORS**: Configured for specific origins
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Express-validator for all critical endpoints

### 2. Error Handling & Logging
- **Centralized Error Handler**: Consistent error responses
- **Winston Logger**: Structured logging with file and console transports
- **Request Logger**: Automatic logging of all HTTP requests
- **Audit Trail**: Complete audit log for critical operations

### 3. Code Organization
- **Service Layer**: Business logic separated from route handlers
- **Validators**: Reusable input validation middleware
- **Controllers**: Thin layer focused on request/response handling
- **Models**: Mongoose schemas organized by domain

### 4. Testing
- **Jest**: Configured for ES modules
- **Unit Tests**: Coverage for validators, controllers, and services
- **Test Commands**:
  - `npm test`: Run all tests
  - `npm run test:watch`: Watch mode
  - `npm run test:coverage`: Coverage report

## API Documentation

### Swagger UI
Access interactive API documentation at: `/api-docs`

### OpenAPI Spec
Download the JSON specification at: `/api-docs.json`

## Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/overtime

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Logging
LOG_LEVEL=info
```

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Testing
```bash
npm test
```

## Security Best Practices Implemented

1. **Authentication & Authorization**
   - JWT-based authentication
   - Role-based access control (RBAC)
   - Token refresh mechanism

2. **Input Validation**
   - All user inputs validated
   - MongoDB ObjectId validation
   - Email and URL sanitization

3. **Error Handling**
   - No sensitive information leaked in errors
   - Proper HTTP status codes
   - Stack traces only in development

4. **Rate Limiting**
   - General API: 100 requests per 15 minutes
   - Login endpoint: 5 attempts per 15 minutes

5. **Audit Logging**
   - All create/update/delete operations logged
   - User IP and User-Agent captured
   - Complete change history

## Middleware Stack (Execution Order)

1. Helmet (security headers)
2. Rate Limiter
3. CORS
4. Body Parser
5. Request Logger
6. Authentication (on protected routes)
7. Input Validation (on specific routes)
8. Audit Middleware (on critical routes)
9. Route Handler
10. Error Handler (catches all errors)

## Services

Services encapsulate business logic and can be reused across controllers:

- **AuditoriaService**: Audit trail logging
- **EquipoService**: Team management logic
- **JugadorService**: Player management logic
- **PartidoService**: Match management logic

## Validators

Reusable validation middleware for common patterns:

- **commonValidators**: ObjectId, pagination, email, dates, etc.
- **equipoValidator**: Team creation/update validation
- **partidoValidator**: Match creation/update validation
- **userValidator**: User creation/update validation

## Migration Notes

All code has been migrated from root directories to `src/`:
- ✅ Controllers migrated
- ✅ Models migrated
- ✅ Middlewares migrated (renamed to middleware)
- ✅ Routes migrated
- ✅ Services migrated
- ✅ Utils migrated
- ✅ All imports updated
- ✅ Old directories removed

## Next Steps

1. ✅ Complete code migration to src/
2. ✅ Standardize folder structure
3. 🔄 Synchronize Swagger documentation
4. 🔄 Expand test coverage
5. ✅ Implement audit logging
6. ✅ Centralize error handling
7. 🔄 Add validators to critical endpoints

## Contributing

When adding new endpoints:

1. Create validators in `src/validators/`
2. Implement business logic in `src/services/`
3. Create controllers in `src/controllers/`
4. Define routes in `src/routes/`
5. Add Swagger documentation
6. Write unit tests
7. Add audit middleware for create/update/delete operations

## Support

For issues or questions, contact the development team.
