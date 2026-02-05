import { PrettyGoodRoutingDefinition, RouterDefinition, RouteDefinition } from "./pretty-good-routing.js";

/*
 * OLD PROTOTYPE
export const apiRoutingDefinition = new PrettyGoodRoutingDefinition(
    new RouterDefinition("/", {
        users: new RouterDefinition("/users", {
            getUser: new RouteDefinition("get", "/:userId"),
            createUser: new RouteDefinition("post", "/"),
        }),
        health: new RouterDefinition("/health", {
            index: new RouteDefinition("get", "/"),
        })

    })
);
*/


export const apiRoutingDefinition = new PrettyGoodRoutingDefinition(
    {
        users: {
            getUser: new RouteDefinition("get", "/:userId"),
            createUser: new RouteDefinition("post", "/"),
        },
        health: {
            index: new RouteDefinition("get", "/"),
        }

    }
);
