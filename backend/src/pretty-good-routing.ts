import { apiRoutingDefinition, ImplementationStructureFromDefinition, InferImplementationStructureFromRouter, PrettyGoodRouteHandler, PrettyGoodRouterHandler, RouteDefinition, RouterDefinition } from "digital-fuesim-manv-shared"
import { RequestHandler, Router } from "express";



export class RouteHandler extends PrettyGoodRouteHandler<RequestHandler> { }

export class RouterHandler<pgRouter> extends PrettyGoodRouterHandler<pgRouter, RequestHandler> { }


export function implementRouter(routerDefinition: RouterDefinition, handling: RouterHandler<any>): Router {
    const router = Router()
    handling.middleware.forEach(mw => router.use(mw));

    for (let routerHandlerEntry of Object.entries(handling.handlers)) {
        const [key, routerHandler] = routerHandlerEntry;

        const definition = routerDefinition.children[key];
        if (!definition) {
            throw new Error(`Definition for router [...]/${routerDefinition.path + "/" + key} is missing`);
        }

        if (routerHandler instanceof RouteHandler) {
            if (!(definition instanceof RouteDefinition)) {
                throw new Error(`Definition for route [...]/${routerDefinition.path + "/" + key} is not a RouteDefinition`);
            }
            router[definition.method](definition.path, ...routerHandler.handlers);
        }
        else if (routerHandler instanceof RouterHandler) {
            if (!(definition instanceof RouterDefinition)) {
                throw new Error(`Definition for router [...]/${routerDefinition.path + "/" + key} is not a RouterDefinition`);
            }
            router.use(definition.path, implementRouter(definition, routerHandler));
        }
    }

    return router;
}




export type InferImplementationStructureFromRouter<Router> =
    Router extends RouterDefinition<infer Children> ? {
        [K in keyof Children]: (
            Children[K] extends RouteDefinition
            ? PrettyGoodRouteHandler
            : (
                Children[K] extends RouterDefinition
                ? PrettyGoodRouterHandler<InferImplementationStructureFromRouter<Children[K]>>
                : never
            )
        )
    } : never
