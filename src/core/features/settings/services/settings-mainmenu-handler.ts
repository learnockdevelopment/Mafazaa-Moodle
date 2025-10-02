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

import { Injectable } from '@angular/core';

import { CoreMainMenuHandler, CoreMainMenuHandlerData } from '@features/mainmenu/services/mainmenu-delegate';
import { CoreMainMenuHandlerToDisplay } from '@features/mainmenu/services/mainmenu-delegate';
import { CoreSites } from '@services/sites';

/**
 * Handler to inject an option into main menu.
 */
@Injectable({ providedIn: 'root' })
export class CoreSettingsMainMenuHandler implements CoreMainMenuHandler {

    static readonly PAGE_NAME = 'settings';
    static instance = new CoreSettingsMainMenuHandler();

    name = 'CoreSettingsMainMenuHandler';
    priority = 100;

    /**
     * Check if the handler is enabled on a site level.
     *
     * @returns Whether or not the handler is enabled on a site level.
     */
    isEnabled(): Promise<boolean> {
        return Promise.resolve(CoreSites.isLoggedIn());
    }

    /**
     * Returns the data needed to render the handler.
     *
     * @returns Data needed to render the handler.
     */
    getDisplayData(): CoreMainMenuHandlerData {
        return {
            title: 'core.settings.appsettings',
            page: CoreSettingsMainMenuHandler.PAGE_NAME,
            class: 'core-settings-handler',
            icon: 'settings',
            showBadge: false,
            badge: '',
            badgeA11yText: '',
        };
    }

    /**
     * Returns the data needed to render the handler.
     *
     * @returns Data needed to render the handler.
     */
    getHandlerData(): CoreMainMenuHandlerToDisplay {
        return {
            title: 'core.settings.appsettings',
            page: CoreSettingsMainMenuHandler.PAGE_NAME,
            class: 'core-settings-handler',
            icon: 'settings',
            showBadge: false,
            badge: '',
            badgeA11yText: '',
            priority: this.priority,
            onlyInMore: false,
        };
    }

}
