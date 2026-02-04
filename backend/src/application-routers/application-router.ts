import type { RequestHandler } from 'express';
import type { AuthService } from '../auth/auth-service.js';

export const createSessionMiddleware =
    (authService: AuthService): RequestHandler =>
    async (req, res, next) => {
        const sessionToken = req.cookies[authService.SESSION_COOKIE_NAME];
        if (sessionToken) {
            // eslint-disable-next-line require-atomic-updates
            req.session =
                await authService.getDataFromSessionToken(sessionToken);
        } else {
            req.session = undefined;
        }

        next();
    };
