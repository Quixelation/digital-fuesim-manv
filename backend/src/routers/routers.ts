import { ImplementationStructureFromDefinition, apiRoutingDefinition } from "digital-fuesim-manv-shared";
import { RouterHandler, RouteHandler } from "../pretty-good-routing.js";

export const serverRoutes = new RouterHandler({
    health: new RouteHandler((req, res, next) => {
        console.log("Health check");
        next();
    }, (req, res) => {
        res.send("ok");
    }),
    users: new RouterHandler({
        getUser: new RouteHandler((req, res) => { }),
        createUser: new RouteHandler((req, res) => { }),
    }),
}, (req, res, next) => {
    console.log(`Request to ${req.path}`);
    next();
}) satisfies ImplementationStructureFromDefinition<typeof apiRoutingDefinition>;
