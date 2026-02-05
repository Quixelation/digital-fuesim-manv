import { Router } from 'express';
import { InferImplementationStructureFromRouter, RouteHandler, RouterHandler } from '../pretty-good-routing.js';
import { apiRoutingDefinition, healthRouterDefinition } from 'digital-fuesim-manv-shared';

export const healthRouter = new RouterHandler<InferImplementationStructureFromRouter<typeof healthRouterDefinition>>({
    // This endpoint is used to determine whether the API itself is running.
    // It should be independent of any other services that may or may not be running.
    // This is used for the Cypress CI.
    index: new RouteHandler(
        (req,res, next)=>{
            console.log("Middleware");
            next()
        },
        async (req, res) => {
            res.send({
                status: 'API running',
            });
        }
    )
})

