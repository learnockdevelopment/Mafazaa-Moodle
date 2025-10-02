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

import { AfterViewInit, Component, OnDestroy, OnInit, viewChild } from '@angular/core';

import { CoreSplitViewComponent } from '@components/split-view/split-view';
import { CoreListItemsManager } from '@classes/items-management/list-items-manager';
import { CoreSettingsSection, CoreSettingsSectionsSource } from '@features/settings/classes/settings-sections-source';
import { CoreRoutedItemsManagerSourcesTracker } from '@classes/items-management/routed-items-manager-sources-tracker';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreLang } from '@services/lang';
import { CoreEvents } from '@singletons/events';

@Component({
    selector: 'page-core-settings-index',
    templateUrl: 'index.html',
    styleUrl: 'index.scss',
    imports: [
        CoreSharedModule,
    ],
})
export default class CoreSettingsIndexPage implements AfterViewInit, OnDestroy, OnInit {

    sections: CoreListItemsManager<CoreSettingsSection>;
    currentLang = 'ar';

    readonly splitView = viewChild.required(CoreSplitViewComponent);

    constructor() {
        const source = CoreRoutedItemsManagerSourcesTracker.getOrCreateSource(CoreSettingsSectionsSource, []);

        this.sections = new CoreListItemsManager(source, CoreSettingsIndexPage);
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        // Get current language
        this.loadCurrentLanguage();

        // Listen for language changes
        CoreEvents.on(CoreEvents.LANGUAGE_CHANGED, () => {
            this.loadCurrentLanguage();
        });
    }

    /**
     * Load current language
     */
    private async loadCurrentLanguage(): Promise<void> {
        try {
            this.currentLang = await CoreLang.getCurrentLanguage();
        } catch (error) {
            console.warn('Failed to load current language:', error);
            this.currentLang = 'ar';
        }
    }

    /**
     * @inheritdoc
     */
    async ngAfterViewInit(): Promise<void> {
        await this.sections.load();
        await this.sections.start(this.splitView());
    }

    /**
     * Get section description based on section name
     */
    getSectionDescription(section: CoreSettingsSection): string {
        const descriptions: { [key: string]: string } = {
            'core.settings.general': 'core.settings.general_description',
            'core.settings.synchronization': 'core.settings.synchronization_description',
            'core.settings.spaceusage': 'core.settings.spaceusage_description',
            'core.settings.about': 'core.settings.about_description',
            'core.settings.dev': 'core.settings.dev_description',
        };

        return descriptions[section.name] || 'core.settings.section_description';
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.sections.destroy();
    }

}
