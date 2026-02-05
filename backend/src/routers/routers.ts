import { apiRoutingDefinition } from "digital-fuesim-manv-shared";
import { RouterHandler, RouteHandler, InferImplementationStructureFromRouter } from "../pretty-good-routing.js";
import { healthRouter } from "./health-router.js";

export const serverRoutes = new RouterHandler<InferImplementationStructureFromRouter<typeof apiRoutingDefinition.router>>({
    health: healthRouter,
    users: new RouterHandler({
        getUser: new RouteHandler((req, res) => { }),
        createUser: new RouteHandler((req, res) => { }),
    }),
}, (req, res, next) => {
    console.log(`Request to ${req.path}`);
    next();
})
