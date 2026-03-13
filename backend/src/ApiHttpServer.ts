import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import type { Server as HttpServer } from 'http';
import type { AuthService } from './auth/auth-service.js';
import { Config } from './config.js';
import type { ExerciseManagerService } from './database/services/exercise-manager-service.js';
import type { ExerciseService } from './database/services/exercise-service.js';
import { createCollectionsRouter } from './routers/collections-router.js';
import { createExerciseManagerRouter } from './routers/exercise-manager-router.js';
import { createExerciseRouter } from './routers/exercise-router.js';
import { healthRouter } from './routers/health-router.js';
import {
    createSessionMiddleware,
    errorHandler,
} from './utils/http-handlers.js';
import { CollectionService } from './database/services/collection-service.js';
import { createAuthRouter } from './routers/auth-router.js';

export class ApiHttpServer {
    public readonly httpServer: HttpServer;
    public constructor(
        app: Express,
        exerciseService: ExerciseService,
        authService: AuthService,
        exerciseManagerService: ExerciseManagerService,
        collectionService: CollectionService
    ) {
        Config.initialize();

        app.use(
            cors({
                origin: [Config.httpFrontendUrl],
                credentials: true,
            })
        );

        app.use(cookieParser());
        app.use(createSessionMiddleware(authService));

        app.use(express.json({ limit: `${Config.uploadLimit}mb` }));

        app.use('/api', healthRouter);

        app.use('/api', createExerciseRouter(exerciseService));

        app.use(
            '/api',
            createExerciseManagerRouter(exerciseManagerService, exerciseService)
        );

        app.use('/api/auth', createAuthRouter(authService));

        app.use('/api/collections', createCollectionsRouter(collectionService));

        app.use(errorHandler);

        this.httpServer = app.listen(Config.httpPort, () => {
            console.log(`HTTP server listening on port ${Config.httpPort}`);
        });
    }

    public close() {
        this.httpServer.close();
    }
}
