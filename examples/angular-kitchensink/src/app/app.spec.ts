import { ApplicationInitStatus } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Oidc } from './services/oidc.service';

describe('App', () => {
  // The test DOM does not load index.html; oidc-spa reads its base URL.
  const base = document.createElement('base');
  base.href = '/';
  beforeAll(() => document.head.appendChild(base));
  afterAll(() => base.remove());

  async function renderApp(isUserInitiallyLoggedIn: boolean) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), Oidc.provideMock({ isUserInitiallyLoggedIn })],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    }).compileComponents();

    const initialization = TestBed.inject(ApplicationInitStatus);
    await initialization.donePromise;
    await TestBed.inject(Oidc).prInitialized;

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers login and registration when logged out', async () => {
    const element = await renderApp(false);
    const buttons = Array.from(element.querySelectorAll('button'), (button) =>
      button.textContent?.trim()
    );

    expect(buttons).toContain('Login');
    expect(buttons).toContain('Register');
    expect(buttons).not.toContain('Logout');
  });

  it('renders the application user and logout when logged in', async () => {
    const element = await renderApp(true);

    expect(element.textContent).toContain('Hello John Doe');
    expect(element.querySelector('button')?.textContent).toBe('Logout');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
