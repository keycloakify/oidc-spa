import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error) => {
  console.error(error);
  const root = document.querySelector('app-root');
  if (root)
    root.textContent = 'Could not start the app. Check the server configuration, then reload.';
});
