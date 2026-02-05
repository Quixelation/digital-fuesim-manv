type RouteType = Record<string, RouterDefinition | RouteDefinition>;

export class PrettyGoodRoutingDefinition<MainRouter extends RouterDefinition<any> = RouterDefinition<any>> {
    constructor(
        public readonly router: MainRouter
    ) { }
}

export class RouterDefinition<T extends RouteType = any> {
    constructor(
        public path: string,
        public children: T
    ) { }
}


export class RouteDefinition {
    constructor(
        public method: "get" | "post" | "put" | "delete",
        public path: string,
    ) { }
}


export abstract class PrettyGoodRouteHandler<T = any> {
    public handlers: T[] = [];
    constructor(...handlers: T[]) {
        this.handlers = handlers;
    }
}

export abstract class PrettyGoodRouterHandler<D, Middleware = any> {
    public middleware: Middleware[] = [];
    constructor(
        public handlers: D,
        ...middleware: Middleware[]
    ) {
        this.middleware = middleware;
    }
}
