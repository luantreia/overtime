const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Overtime API',
      version: '1.0.0',
      description: 'Documentation for Overtime API',
      contact: {
        name: 'API Support',
        email: 'support@overtime.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api', // Update with your server URL
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    path.join(__dirname, '../routes/**/*.js'),
    path.join(__dirname, './schemas/*.yaml'),
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
