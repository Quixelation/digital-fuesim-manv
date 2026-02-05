import { Router } from 'express';
import { RouteHandler, RouterHandler } from '../pretty-good-routing.js';
import { apiRoutingDefinition, InferImplementationStructureFromRouter } from 'digital-fuesim-manv-shared';

export const healthRouter = new RouterHandler({
    // This endpoint is used to determine whether the API itself is running.
    // It should be independent of any other services that may or may not be running.
    // This is used for the Cypress CI.
    index: new RouteHandler(
        async (req, res) => {
            res.send({
                status: 'API running',
            });
        }
    )
}) satisfies InferImplementationStructureFromRouter<typeof apiRoutingDefinition.router.children.health>

