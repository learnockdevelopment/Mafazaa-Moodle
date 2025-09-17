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
import { CoreContentLinksAction } from '@features/contentlinks/services/contentlinks-delegate';
import { CoreContentLinksHandlerBase } from '@features/contentlinks/classes/base-handler';
import { makeSingleton, Translate } from '@singletons';
import { CoreSites } from '@services/sites';
import { CoreCourseOverview } from '../course-overview';
import { CoreCourses } from '@features/courses/services/courses';
import { CoreCourseHelper } from '../course-helper';
import { CORE_COURSE_OVERVIEW_OPTION_NAME } from '@features/course/constants';
import { CoreAlerts } from '@services/overlays/alerts';

/**
 * Handler to treat links to activities overview.
 */
@Injectable({ providedIn: 'root' })
export class CoreCourseOverviewLinkHandlerService extends CoreContentLinksHandlerBase {

    name = 'CoreCourseOverviewLinkHandler';
    pattern = /\/course\/overview\.php.*([?&]id=)/;

    /**
     * @inheritdoc
     */
    getActions(
        siteIds: string[],
        url: string,
        params: Record<string, string>,
        courseId?: number,
    ): CoreContentLinksAction[] | Promise<CoreContentLinksAction[]> {
        courseId = courseId || Number(params.id);

        return [{
            action: async (siteId): Promise<void> => {
                // Check if it's enabled.
                const options = await CoreCourses.getCoursesAdminAndNavOptions([courseId]);

                if (!options.navOptions[courseId].overview) {
                    CoreAlerts.showError(Translate.instant('core.nopermissions', {
                        $a: Translate.instant('core.course.course:viewoverview'),
                    }));

                    return;
                }

                await CoreCourseHelper.getAndOpenCourse(courseId, { selectedTab: CORE_COURSE_OVERVIEW_OPTION_NAME }, siteId);
            },
        }];
    }

    /**
     * @inheritdoc
     */
    async isEnabled(siteId: string, url: string, params: Record<string, string>): Promise<boolean> {
        const courseId = Number(params.id);
        if (!courseId) {
            return false;
        }

        const site = await CoreSites.getSite(siteId);

        return CoreCourseOverview.canGetInformation(site);
    }

}

export const CoreCourseOverviewLinkHandler = makeSingleton(CoreCourseOverviewLinkHandlerService);
