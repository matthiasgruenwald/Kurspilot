'use strict';

class MoodlePage {
  constructor(page, moodleUrl, credentials) {
    this._page = page;
    this._moodleUrl = moodleUrl.replace(/\/+$/, '');
    this._credentials = credentials;
  }

  async login() {
    const { moodleToken, username, password } = this._credentials;
    if (username && password) {
      await this._page.goto(`${this._moodleUrl}/login/index.php`, { waitUntil: 'networkidle' });
      await this._page.fill('#username', username);
      await this._page.fill('#password', password);
      await this._page.click('#loginbtn');
      await this._page.waitForLoadState('networkidle');
      return;
    }
    if (moodleToken) {
      await this._page.goto(
        `${this._moodleUrl}/login/token_login.php?token=${moodleToken}`,
        { waitUntil: 'networkidle' }
      );
    }
  }

  async goToCourse(courseId) {
    await this._page.goto(
      `${this._moodleUrl}/course/view.php?id=${courseId}`,
      { waitUntil: 'networkidle' }
    );
  }

  async waitForCourseContent() {
    await this._page.waitForSelector('.course-content', { timeout: 15_000 });
  }

  page() {
    return this._page;
  }
}

module.exports = { MoodlePage };
