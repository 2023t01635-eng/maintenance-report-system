import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Maintenance Request Reporting System API",
      version: "0.1.0",
      description: "REST API for machinery, parts, maintenance plans, alerts, work orders, evidence, and reports."
    },
    servers: [
      {
        url: "http://localhost:4000/api",
        description: "Local development API"
      }
    ]
  },
  apis: ["src/**/*.ts"]
});

export { swaggerUi };
