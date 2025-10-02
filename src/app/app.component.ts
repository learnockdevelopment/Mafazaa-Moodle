// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { AfterViewInit, Component, OnInit, viewChild, inject } from '@angular/core';
import { IonRouterOutlet, IonicModule } from '@ionic/angular';
import { BackButtonEvent } from '@ionic/core';
import { TranslateService } from '@ngx-translate/core';

import { CoreLoginHelper } from '@features/login/services/login-helper';
import { SplashScreen } from '@singletons';
import { CoreApp } from '@services/app';
import { CoreNavigator } from '@services/navigator';
import { CoreSubscriptions } from '@singletons/subscriptions';
import { CoreWindow } from '@singletons/window';
import { CorePlatform } from '@services/platform';
import { CoreLogger } from '@singletons/logger';
import { CorePromisedValue } from '@classes/promised-value';
import { register } from 'swiper/element/bundle';
import { CoreWait } from '@singletons/wait';
import { CoreOpener } from '@singletons/opener';
import { BackButtonPriority } from '@/core/constants';
import { CoreLang } from '@services/lang';
import { CoreEvents } from '@singletons/events';

register();

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    imports: [IonicModule],
})
export class AppComponent implements OnInit, AfterViewInit {

    readonly outlet = viewChild.required(IonRouterOutlet);

    protected logger = CoreLogger.getInstance('AppComponent');
    currentLang = 'en';

    private translate = inject(TranslateService);

    constructor() {
        // Language detection moved to ngOnInit
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        // Detect language and set direction first
        await this.detectAndSetLanguage();

        // Also set direction after a short delay to ensure DOM is ready
        setTimeout(async () => {
            await this.detectAndSetLanguage();
        }, 100);

        // Remove forced RTL to allow dynamic dir based on language

        // Listen to language changes via events instead of polling
        CoreEvents.on(CoreEvents.LANGUAGE_CHANGED, () => this.loadCurrentLanguage());

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = <any> window;

        CorePlatform.resume.subscribe(() => {
            // Wait a second before setting it to false since in iOS there could be some frozen WS calls.
            setTimeout(() => {
                if (CoreLoginHelper.isWaitingForBrowser() && !CoreOpener.isInAppBrowserOpen()) {
                    CoreLoginHelper.stopWaitingForBrowser();
                    CoreLoginHelper.checkLogout();
                }
            }, 1000);
        });

        // "Expose" CoreWindow.open.
        win.openWindowSafely = (url: string, name?: string): void => {
            CoreWindow.open(url, name);
        };

        // Treat URLs that try to override the app.
        win.onOverrideUrlLoading = (url: string) => {
            CoreWindow.open(url);
        };

        // Quit app with back button.
        document.addEventListener('ionBackButton', (event: BackButtonEvent) => {
            event.detail.register(BackButtonPriority.QUIT_APP, async () => {
                const initialPath = CoreNavigator.getCurrentPath();
                if (initialPath.startsWith('/main/')) {
                    // Main menu has its own callback to handle back. If this callback is called it means we should exit app.
                    CoreApp.closeApp();

                    return;
                }

                // This callback can be called at the same time as Ionic's back navigation callback.
                // Check if the path changes due to the back navigation handler, to know if we're at root level.
                // Ionic doc recommends IonRouterOutlet.canGoBack, but there's no easy way to get the current outlet from here.
                // The path seems to change immediately (0 ms timeout), but use 50ms just in case.
                await CoreWait.wait(50);

                if (CoreNavigator.getCurrentPath() != initialPath) {
                    // Ionic has navigated back, nothing else to do.
                    return;
                }

                // Quit the app.
                CoreApp.closeApp();
            });
        });

        // Workaround for error "Blocked aria-hidden on an element because its descendant retained
        // focus. The focus must not be hidden from assistive technology users. Avoid using
        // aria-hidden on a focused element or its ancestor. Consider using the inert attribute
        // instead, which will also prevent focus. For more details, see the aria-hidden section of the
        // WAI-ARIA specification at https://w3c.github.io/aria/#aria-hidden."
        const observer = new MutationObserver((mutations) => {
            if (!(document.activeElement instanceof HTMLElement)) {
                return;
            }
            for (const mutation of mutations) {
                if (mutation.target instanceof HTMLElement &&
                        mutation.target.ariaHidden === 'true' &&
                        mutation.target.contains(document.activeElement)) {
                    document.activeElement.blur();

                    return;
                }
            }
        });
        observer.observe(document.body, {
            attributeFilter: ['aria-hidden'],
            subtree: true,
        });

        // @todo Pause Youtube videos in Android when app is put in background or screen is locked?
        // See: https://github.com/moodlehq/moodleapp/blob/ionic3/src/app/app.component.ts#L312
    }

    /**
     * @inheritdoc
     */
    ngAfterViewInit(): void {
        this.logger.debug('App component initialized');

        CoreSubscriptions.once(this.outlet().activateEvents, async () => {
            await CorePlatform.ready();

            this.logger.debug('Hide splash screen');
            SplashScreen.hide();
            this.setSystemUIColorsAfterSplash();
        });
    }

    /**
     * Set the system UI Colors after hiding the splash to ensure it's correct.
     *
     * @returns Promise resolved when done.
     */
    protected async setSystemUIColorsAfterSplash(): Promise<void> {
        // When the app starts and the splash is hidden, the color of the bars changes from transparent to black.
        // We have to set the current color but we don't know when the change will be made.
        // This problem is only related to Android, so on iOS it will be only set once.
        if (!CorePlatform.isAndroid()) {
            CoreApp.setSystemUIColors();

            return;
        }

        const promise = new CorePromisedValue<void>();

        const interval = window.setInterval(() => {
            CoreApp.setSystemUIColors();
        });
        setTimeout(() => {
            clearInterval(interval);
            promise.resolve();

        }, 1000);

        return promise;
    }

    /**
     * Detect language and set appropriate direction
     */
    private async detectAndSetLanguage(): Promise<void> {
        try {
            // Get current language from CoreLang
            const detectedLang = await CoreLang.getCurrentLanguage();
            this.currentLang = detectedLang || 'en'; // Default to English if undefined

            this.logger.debug(`Detected language: ${this.currentLang}`);

            // Set the language
            this.translate.setDefaultLang('en'); // Default to English
            this.translate.use(this.currentLang);

            // Set direction based on language
            this.setLanguageDirection(this.currentLang);

            // Listen for language changes
            // Already subscribed in ngOnInit

        } catch (error) {
            this.logger.warn('Failed to detect language, using English as default:', error);
            this.currentLang = 'en';
            this.translate.setDefaultLang('en');
            this.translate.use('en');
            this.setLanguageDirection('en');
        }
    }

    /**
     * Load current language
     */
    private async loadCurrentLanguage(): Promise<void> {
        try {
            const newLang = await CoreLang.getCurrentLanguage();
            if (newLang !== this.currentLang) {
                this.logger.debug(`Language changed from ${this.currentLang} to ${newLang}`);
                this.currentLang = newLang || 'en';
                this.setLanguageDirection(this.currentLang);

                // Force update all components
                CoreEvents.trigger(CoreEvents.LANGUAGE_CHANGED, {
                    newLang: this.currentLang,
                    oldLang: this.currentLang
                });
            }
        } catch (error) {
            this.logger.warn('Failed to load current language:', error);
            this.currentLang = 'ar';
            this.setLanguageDirection('ar');
        }
    }

    /**
     * Set language direction based on language code
     *
     * @param lang Language code
     */
    private setLanguageDirection(lang: string): void {
        const htmlElement = document.documentElement;

        this.logger.debug(`Setting direction for language: ${lang}`);

        // Arabic = RTL, English = LTR (default)
        if (lang === 'ar') {
            // Arabic = RTL
            htmlElement.setAttribute('dir', 'rtl');
            htmlElement.setAttribute('lang', 'ar');
            document.body.classList.remove('ltr');
            document.body.classList.add('rtl');
            document.body.setAttribute('dir', 'rtl');
            this.logger.debug('RTL layout set for Arabic');
        } else if (lang === 'en') {
            // English = LTR
            htmlElement.setAttribute('dir', 'ltr');
            htmlElement.setAttribute('lang', 'en');
            document.body.classList.remove('rtl');
            document.body.classList.add('ltr');
            document.body.setAttribute('dir', 'ltr');
            this.logger.debug('LTR layout set for English');
        } else {
            // Default to English LTR
            htmlElement.setAttribute('dir', 'ltr');
            htmlElement.setAttribute('lang', 'en');
            document.body.classList.remove('rtl');
            document.body.classList.add('ltr');
            document.body.setAttribute('dir', 'ltr');
            this.logger.debug('Default LTR layout set');
        }

        // Force a reflow to ensure changes take effect
        htmlElement.offsetHeight;
    }

    /**
     * Force RTL layout immediately
     */
    private forceRTL(): void { /* no-op: handled by setLanguageDirection */ }

}
