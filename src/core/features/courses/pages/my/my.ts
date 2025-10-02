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

import { AddonBlockMyOverviewComponent } from '@addons/block/myoverview/components/myoverview/myoverview';
import { Component, OnDestroy, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { AsyncDirective } from '@classes/async-directive';
import { PageLoadsManager } from '@classes/page-loads-manager';
import { CorePromisedValue } from '@classes/promised-value';
import { CoreBlockDelegate } from '@features/block/services/block-delegate';
import { CoreCourseBlock } from '@features/course/services/course';
import { CoreCoursesDashboard } from '@features/courses/services/dashboard';
import { CoreSites } from '@services/sites';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreLang } from '@services/lang';
import { Subscription } from 'rxjs';
import { CoreTime } from '@singletons/time';
import { CoreAnalytics, CoreAnalyticsEventType } from '@services/analytics';
import { Translate } from '@singletons';
import { CoreWait } from '@singletons/wait';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreBlockSideBlocksButtonComponent } from '../../../block/components/side-blocks-button/side-blocks-button';
import { CoreCoursesMyPageName } from '@features/courses/constants';
import { ADDON_BLOCK_MYOVERVIEW_BLOCK_NAME } from '@addons/block/myoverview/constants';
import { CoreUser } from '@features/user/services/user';
import { CoreNavigator } from '@services/navigator';
import { CoreModals } from '@services/overlays/modals';
import { CoreCourses } from '@features/courses/services/courses';
import { CoreEnrolledCourseDataWithExtraInfo, CoreCoursesHelper, CoreCourseSearchedDataWithExtraInfoAndOptions } from '@features/courses/services/courses-helper';
import { CoreCourseSearchedData } from '@features/courses/services/courses';
import { CoreCourseHelper } from '@features/course/services/course-helper';
import { CoreMainMenuUserButtonComponent } from '@features/mainmenu/components/user-menu-button/user-menu-button';

/**
 * Page that shows a my courses.
 */
@Component({
    selector: 'page-core-courses-my',
    templateUrl: 'my.html',
    styleUrl: 'my.scss',
    providers: [{
            provide: PageLoadsManager,
            useClass: PageLoadsManager,
        }],
    imports: [
        CoreSharedModule,
        CoreBlockSideBlocksButtonComponent,
        CoreMainMenuUserButtonComponent,
    ],
})
export default class CoreCoursesMyPage implements OnInit, OnDestroy, AsyncDirective {


    downloadCoursesEnabled = false;
    userId: number;
    loadedBlock?: Partial<CoreCourseBlock>;
    myOverviewBlock?: AddonBlockMyOverviewComponent;
    loaded = false;
    myPageCourses = CoreCoursesMyPageName.COURSES;
    hasSideBlocks = false;

    // User data for app bar
    userFullName = '';
    userFirstName = '';
    userLastName = '';
    userProfileImageUrl = '';

    // Course data for vertical cards
    courses: CoreCourseSearchedDataWithExtraInfoAndOptions[] = [];
    allCourses: CoreCourseSearchedDataWithExtraInfoAndOptions[] = []; // Store original courses for search
    coursesLoaded = false;
    selectedStatus = 'all';
    selectedCategory = 'all';
    availableCategories: { id: number; name: string; count: number }[] = [];
    searchTerm = '';
    currentLang = 'ar';

    protected updateSiteObserver: CoreEventObserver;
    protected onReadyPromise = new CorePromisedValue<void>();
    protected loadsManagerSubscription: Subscription;
    protected logView: () => void;
    protected loadsManager = inject(PageLoadsManager);

    constructor(private cdRef: ChangeDetectorRef) {
        // Refresh the enabled flags if site is updated.
        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, async () => {
            this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();
        }, CoreSites.getCurrentSiteId());

        this.userId = CoreSites.getCurrentSiteUserId();

        this.loadsManagerSubscription = this.loadsManager.onRefreshPage.subscribe(() => {
            this.loaded = false;
            this.loadContent();
        });


        this.logView = CoreTime.once(async () => {
            await CorePromiseUtils.ignoreErrors(CoreCourses.logView('my'));

            CoreAnalytics.logEvent({
                type: CoreAnalyticsEventType.VIEW_ITEM,
                ws: 'core_my_view_page',
                name: Translate.instant('core.courses.mycourses'),
                data: { category: 'course', page: 'my' },
                url: '/my/courses.php',
            });
        });
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();

        CoreSites.loginNavigationFinished();

        // Get current language
        this.loadCurrentLanguage();

        // Listen for language changes
        CoreEvents.on(CoreEvents.LANGUAGE_CHANGED, () => {
            console.log('Language change event detected');
            this.loadCurrentLanguage();
            // Force translation update
            setTimeout(() => {
                this.cdRef.detectChanges();
            }, 200);
        });

        // Also listen for site updates which might include language changes
        CoreEvents.on(CoreEvents.SITE_UPDATED, () => {
            console.log('Site updated event detected');
            this.loadCurrentLanguage();
        });

        // Periodic check for language changes (fallback)
        setInterval(() => {
            this.checkLanguageChange();
        }, 1000);

        // Load user data for app bar
        await this.loadUserData();

        // Load course data for vertical cards
        await this.loadCourses();

        this.loadContent(true);
    }

    /**
     * Load current language
     */
    private async loadCurrentLanguage(): Promise<void> {
        try {
            this.currentLang = await CoreLang.getCurrentLanguage();

            // Force change detection to update translations
            setTimeout(() => {
                // Trigger change detection for translations
                this.cdRef.detectChanges();
            }, 100);
        } catch (error) {
            console.warn('Failed to load current language:', error);
            this.currentLang = 'ar'; // Fallback to Arabic
        }
    }

    /**
     * Check for language changes
     */
    private async checkLanguageChange(): Promise<void> {
        try {
            const newLang = await CoreLang.getCurrentLanguage();
            if (newLang !== this.currentLang) {
                console.log('Language changed from', this.currentLang, 'to', newLang);
                this.currentLang = newLang;
                // Force translation update
                setTimeout(() => {
                    this.cdRef.detectChanges();
                }, 100);
            }
        } catch (error) {
            // Ignore errors in periodic check
        }
    }

    /**
     * Manual language change for testing
     */
    toggleLanguage(): void {
        this.currentLang = this.currentLang === 'ar' ? 'en' : 'ar';
        console.log('Manual language toggle to:', this.currentLang);
        // Force translation update
        setTimeout(() => {
            this.cdRef.detectChanges();
        }, 100);
    }

    /**
     * Load data.
     *
     * @param firstLoad Whether it's the first load.
     */
    protected async loadContent(firstLoad = false): Promise<void> {
        const loadWatcher = this.loadsManager.startPageLoad(this, !!firstLoad);
        const available = await CoreCoursesDashboard.isAvailable();
        const disabled = CoreCourses.isMyCoursesDisabledInSite();

        const supportsMyParam = !!CoreSites.getCurrentSite()?.isVersionGreaterEqualThan('4.0');

        if (available && !disabled) {
            try {
                const blocks = await loadWatcher.watchRequest(
                    CoreCoursesDashboard.getDashboardBlocksObservable({
                        myPage: supportsMyParam ? this.myPageCourses : undefined,
                        readingStrategy: loadWatcher.getReadingStrategy(),
                    }),
                );

                // My overview block should always be in main blocks, but check side blocks too just in case.
                this.loadedBlock = blocks.mainBlocks.concat(blocks.sideBlocks).find((block) =>
                    block.name === ADDON_BLOCK_MYOVERVIEW_BLOCK_NAME);
                this.hasSideBlocks = supportsMyParam && CoreBlockDelegate.hasSupportedBlock(blocks.sideBlocks);

                await CoreWait.nextTicks(2);

                if (!this.loadedBlock && !supportsMyParam) {
                    // In old sites, display the block even if not found in Dashboard.
                    // This is because the "My courses" page doesn't exist in the site so it can't be configured.
                    this.loadFallbackBlock();
                }
            } catch (error) {
                CoreAlerts.showError(error);

                // Cannot get the blocks, just show the block if needed.
                this.loadFallbackBlock();
            }
        } else if (!available) {
            // WS not available, show fallback block.
            this.loadFallbackBlock();
        } else {
            this.loadedBlock = undefined;
        }

        this.loaded = true;
        this.onReadyPromise.resolve();

        this.logView();
    }

    /**
     * Load fallback blocks.
     */
    protected loadFallbackBlock(): void {
        this.loadedBlock = {
            name: ADDON_BLOCK_MYOVERVIEW_BLOCK_NAME,
            visible: true,
        };
    }

    /**
     * Refresh the data.
     *
     * @param refresher Refresher.
     */
    async refresh(refresher?: HTMLIonRefresherElement): Promise<void> {

        const promises: Promise<void>[] = [];

        promises.push(CoreCoursesDashboard.invalidateDashboardBlocks(CoreCoursesMyPageName.COURSES));

        // Invalidate the blocks.
        if (this.myOverviewBlock) {
            promises.push(CorePromiseUtils.ignoreErrors(this.myOverviewBlock.invalidateContent()));
        }

        Promise.all(promises).finally(() => {
            this.loadContent().finally(() => {
                refresher?.complete();
            });
        });
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.updateSiteObserver?.off();
        this.loadsManagerSubscription.unsubscribe();
    }

    /**
     * @inheritdoc
     */
    async ready(): Promise<void> {
        return await this.onReadyPromise;
    }

    /**
     * Load user data for app bar
     */
    private async loadUserData(): Promise<void> {
        try {
            const site = CoreSites.getRequiredCurrentSite();
            const userInfo = site.getInfo();

            if (userInfo) {
                this.userFullName = userInfo.fullname || '';
                this.userFirstName = userInfo.firstname || '';
                this.userLastName = userInfo.lastname || '';

                // Get user profile image
                if (this.userId) {
                    try {
                        const userData = await CoreUser.getProfile(this.userId, undefined, false, site.getId());
                        this.userProfileImageUrl = userData.profileimageurl || '';

                        // If no profile image, try to get user avatar from site info
                        if (!this.userProfileImageUrl && userInfo.userpictureurl) {
                            this.userProfileImageUrl = userInfo.userpictureurl;
                        }
                    } catch (error) {
                        console.warn('Failed to load user profile image:', error);
                        // Try to get user avatar from site info as fallback
                        if (userInfo.userpictureurl) {
                            this.userProfileImageUrl = userInfo.userpictureurl;
                        } else {
                            this.userProfileImageUrl = '';
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load user data:', error);
            // Set default values if loading fails
            this.userFullName = 'User';
            this.userProfileImageUrl = '';
        }
    }

    /**
     * Handle avatar click to open main menu drawer
     */
    async onAvatarClick(): Promise<void> {
        const { CoreMainMenuUserMenuComponent } = await import('@features/mainmenu/components/user-menu/user-menu');

        CoreModals.openSideModal<void>({
            component: CoreMainMenuUserMenuComponent,
        });
    }

    /**
     * Handle notification click
     */
    onNotificationClick(): void {
        CoreNavigator.navigate('/main/notifications');
    }

    /**
     * Load courses for vertical cards
     */
    private async loadCourses(): Promise<void> {
        try {
            // Get all courses with full details including contacts and images
            const allCourses = await CoreCourses.getCoursesByField();

            // Filter out non-course items like "Elassr Academy" and cast to proper type
            const filteredCourses = allCourses.filter(course => {
                // Filter out items that are not real courses
                const courseName = course.fullname?.toLowerCase() || '';
                return !courseName.includes('elassr academy') &&
                       !courseName.includes('academy') &&
                       course.id > 0; // Ensure it has a valid course ID
            }) as CoreCourseSearchedDataWithExtraInfoAndOptions[];

            // Ensure course images are loaded
            await this.loadCourseImages(filteredCourses);

            // Force set some test images for debugging
            if (filteredCourses.length > 0) {
                filteredCourses.forEach((course, index) => {
                    if (!course.courseimage) {
                        // Set a test image URL for debugging
                        course.courseimage = `https://picsum.photos/300/200?random=${course.id}`;
                    }
                });
            }

            this.courses = filteredCourses;
            this.allCourses = filteredCourses; // Store original courses for search

            // Extract categories from courses
            this.extractCategories(filteredCourses);

            this.coursesLoaded = true;

            // Force change detection to ensure images are rendered
            this.cdRef.detectChanges();
        } catch (error) {
            console.error('Error loading courses:', error);
            this.courses = [];
            this.allCourses = [];
            this.availableCategories = [];
            this.coursesLoaded = true;
        }
    }

    /**
     * Open course details
     */
    openCourse(course: CoreCourseSearchedDataWithExtraInfoAndOptions): void {
        // For now, try to open the course directly
        // The CoreCourseHelper will handle enrollment checking
        CoreCourseHelper.openCourse(course, { params: { isGuest: false } });
    }

    /**
     * Handle search input
     */
    onSearch(event: any): void {
        this.searchTerm = event.target.value.toLowerCase().trim();

        if (this.searchTerm === '') {
            // If search is empty, return to normal filtered view
            this.applyFilters();
        } else {
            // If there's search text, override all filters and show only search results
            this.courses = this.allCourses.filter(course => {
                const courseName = course.fullname?.toLowerCase() || '';
                const courseSummary = course.summary?.toLowerCase() || '';
                const instructorName = this.getCourseInstructor(course).toLowerCase();

                return courseName.includes(this.searchTerm) ||
                       courseSummary.includes(this.searchTerm) ||
                       instructorName.includes(this.searchTerm);
            });
        }
    }

    /**
     * Handle view all button click
     */
    onViewAll(): void {
        // Show all courses in current filter (remove any search term)
        this.courses = [...this.allCourses];
        this.applyFilters();
    }

    /**
     * Get course instructor from contacts
     */
    getCourseInstructor(course: CoreCourseSearchedDataWithExtraInfoAndOptions): string {
        if (course.contacts && course.contacts.length > 0) {
            return course.contacts[0].fullname;
        }
        return ''; // No fallback - show empty if no instructor
    }

    /**
     * Get course duration from start and end dates
     */
    getCourseDuration(course: CoreCourseSearchedDataWithExtraInfoAndOptions): string {
        if (course.startdate && course.enddate) {
            const startDate = new Date(course.startdate * 1000);
            const endDate = new Date(course.enddate * 1000);
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return `${diffDays} يوم`; // Days
        }
        return '16 ساعة'; // Fallback
    }

    /**
     * Get course rating (mock for now, could be enhanced with real rating system)
     */
    getCourseRating(course: CoreCourseSearchedDataWithExtraInfoAndOptions): number[] {
        // Mock rating based on course ID for consistency
        const rating = (course.id % 5) + 1; // 1-5 stars
        return Array(5).fill(0).map((_, i) => i < rating ? 1 : 0);
    }


    /**
     * Filter courses by status
     */
    filterByStatus(status: string): void {
        this.selectedStatus = status;
        this.applyFilters();
    }

    /**
     * Filter courses by category
     */
    filterByCategory(category: string): void {
        this.selectedCategory = category;
        this.applyFilters();
    }

    /**
     * Apply current filters to courses
     */
    private applyFilters(): void {
        let filteredCourses = [...this.allCourses];

        // Apply status filter first
        if (this.selectedStatus === 'popular') {
            // Sort by mock rating (higher rating = more popular)
            filteredCourses = filteredCourses.sort((a, b) => {
                const ratingA = (a.id % 5) + 1;
                const ratingB = (b.id % 5) + 1;
                return ratingB - ratingA;
            });
        } else if (this.selectedStatus === 'upcoming') {
            // Filter courses that start in the future
            filteredCourses = filteredCourses.filter(course => {
                if (course.startdate) {
                    const startDate = new Date(course.startdate * 1000);
                    return startDate > new Date();
                }
                return false;
            });
        } else if (this.selectedStatus === 'ended') {
            // Filter courses that have ended
            filteredCourses = filteredCourses.filter(course => {
                if (course.enddate) {
                    const endDate = new Date(course.enddate * 1000);
                    return endDate < new Date();
                }
                return false;
            });
        }

        // Apply category filter
        if (this.selectedCategory !== 'all') {
            const categoryId = parseInt(this.selectedCategory);
            filteredCourses = filteredCourses.filter(course => course.categoryid === categoryId);
        }

        this.courses = filteredCourses;
    }

    /**
     * Get category title for display
     */
    getCategoryTitle(): string {
        // If searching, show search results title
        if (this.searchTerm) {
            return 'core.home.search_results';
        }

        if (this.selectedStatus === 'popular') {
            return 'core.home.popular_courses';
        } else if (this.selectedStatus === 'upcoming') {
            return 'core.home.upcoming_courses';
        } else if (this.selectedStatus === 'ended') {
            return 'core.home.ended_courses';
        } else if (this.selectedCategory !== 'all') {
            // It's a category ID
            const category = this.availableCategories.find(cat => cat.id.toString() === this.selectedCategory);
            return category ? category.name : 'core.home.all_courses';
        } else {
            return 'core.home.all_courses';
        }
    }

    /**
     * Extract categories from courses
     */
    private extractCategories(courses: CoreCourseSearchedDataWithExtraInfoAndOptions[]): void {
        const categoryMap = new Map<number, { name: string; count: number }>();

        courses.forEach(course => {
            if (course.categoryid && course.categoryname) {
                if (categoryMap.has(course.categoryid)) {
                    categoryMap.get(course.categoryid)!.count++;
                } else {
                    categoryMap.set(course.categoryid, {
                        name: course.categoryname,
                        count: 1
                    });
                }
            }
        });

        // Convert to array and sort by count (most courses first)
        this.availableCategories = Array.from(categoryMap.entries())
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Limit to top 10 categories
    }

    /**
     * Check if a category is selected
     */
    isCategorySelected(categoryId: string): boolean {
        return this.selectedCategory === categoryId;
    }

    /**
     * Load course images for all courses
     */
    private async loadCourseImages(courses: CoreCourseSearchedDataWithExtraInfoAndOptions[]): Promise<void> {
        try {
            // Process each course to ensure image data is available
            for (const course of courses) {
                try {
                    // First check if courseimage is already set
                    if (course.courseimage) {
                        continue;
                    }

                    // Check if course has overviewfiles and set courseimage
                    if (course.overviewfiles && course.overviewfiles.length > 0) {
                        const imageUrl = course.overviewfiles[0].fileurl;
                        if (imageUrl) {
                            course.courseimage = imageUrl;
                            continue;
                        }
                    }

                    // If no courseimage, set a fallback color
                    try {
                        const colors = await CoreCoursesHelper.getCourseSiteColors();
                        const colorNumber = course.id % 10;
                        course.colorNumber = colorNumber;
                        course.color = colors.length ? colors[colorNumber] : undefined;
                    } catch (colorError) {
                        // Set a default color
                        course.colorNumber = course.id % 10;
                        course.color = '#8B4513';
                    }
                } catch (error) {
                    // Set a default color on error
                    course.colorNumber = course.id % 10;
                    course.color = '#8B4513';
                }
            }

        } catch (error) {
            // Set default colors for all courses on error
            courses.forEach(course => {
                course.colorNumber = course.id % 10;
                course.color = '#8B4513';
            });
        }
    }

}
