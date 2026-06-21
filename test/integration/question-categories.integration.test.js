'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
  callMoodleAsUserWithoutManagecategory,
  hasNoManagecategoryTestConfig,
  SKIP_REASON_NO_MANAGECATEGORY,
} = require('../helpers/moodle-test-client');

// Wird auf der Test-Moodle-Instanz noch ausgerollt (Plugin-Update ist ein
// HITL-Folgeschritt nach Merge). Solange die Webservice-Funktionen dort
// unbekannt sind, werden die Tests sauber uebersprungen.
const UNKNOWN_FUNCTION_ERRORCODES = ['invalidwsfunction', 'invalidrecord'];

function isUnknownFunctionError(err) {
  return UNKNOWN_FUNCTION_ERRORCODES.some((code) => err.message.includes(code))
    || err.message.includes('invalid_parameter_exception')
    || err.message.includes('Unknown function');
}

const TEST_CATEGORY_NAME = '7.2 Stoffe und ihre Eigenschaften (Integrationstest)';
const TEST_QUESTION_BANK_NAME = 'Biologie 9a - Immunsystem';

test(
  'local_aicoursecreator_create_question_category legt Kategorie in benannter Kurs-Fragensammlung an (idempotent)',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let questionBank;
    try {
      questionBank = await callMoodle('local_aicoursecreator_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID,
        name: TEST_QUESTION_BANK_NAME,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion lokal_aicoursecreator_ensure_question_bank noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(questionBank.questionbankid > 0, 'Fragensammlung sollte eine gueltige CMID erhalten');
    assert.ok(questionBank.topcategoryid > 0, 'Fragensammlung sollte eine Top-Kategorie haben');
    assert.strictEqual(questionBank.name, TEST_QUESTION_BANK_NAME);

    const secondQuestionBank = await callMoodle('local_aicoursecreator_ensure_question_bank', {
      courseid: MOODLE_TEST_COURSEID,
      name: TEST_QUESTION_BANK_NAME,
    });
    assert.strictEqual(secondQuestionBank.questionbankid, questionBank.questionbankid,
      'Gleichnamige Fragensammlung muss wiederverwendet werden');
    assert.strictEqual(secondQuestionBank.created, false,
      'Erneutes Ensuren darf keine zweite Fragensammlung anlegen');

    let created;
    try {
      created = await callMoodle('local_aicoursecreator_create_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        questionbankid: questionBank.questionbankid,
        name: TEST_CATEGORY_NAME,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion lokal_aicoursecreator_create_question_category noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.id > 0, 'Kategorie sollte eine gueltige ID erhalten');
    assert.strictEqual(typeof created.created, 'boolean');

    // Abrufen: Kategorie muss in der Liste auftauchen.
    const categories = await callMoodle('local_aicoursecreator_get_question_categories', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: questionBank.questionbankid,
    });

    assert.ok(Array.isArray(categories));
    assert.ok(categories.some((c) => c.id === questionBank.topcategoryid),
      'Top-Kategorie der benannten Fragensammlung muss in get_question_categories auftauchen');
    const found = categories.find((c) => c.id === created.id);
    assert.ok(found, 'Neu angelegte Kategorie muss in get_question_categories auftauchen');
    assert.strictEqual(found.name, TEST_CATEGORY_NAME);

    // Erneutes Anlegen mit identischem Namen: idempotent, keine Dublette.
    const second = await callMoodle('local_aicoursecreator_create_question_category', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: questionBank.questionbankid,
      name: TEST_CATEGORY_NAME,
    });

    assert.strictEqual(second.id, created.id, 'Erneutes Anlegen muss die bestehende Kategorie-ID zurueckgeben');
    assert.strictEqual(second.created, false, 'Erneutes Anlegen darf keine neue Kategorie erzeugen (created=false)');

    const categoriesAfter = await callMoodle('local_aicoursecreator_get_question_categories', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: questionBank.questionbankid,
    });
    const matches = categoriesAfter.filter((c) => c.name === TEST_CATEGORY_NAME);
    assert.strictEqual(matches.length, 1, 'Es darf keine Dublette der Kategorie geben');
  }
);

test(
  'local_aicoursecreator_update_question_category verschiebt eine Kategorien-Unterstruktur nicht-destruktiv in die Ziel-Fragensammlung',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const suffix = Date.now();
    const sourceBankName = `${TEST_QUESTION_BANK_NAME} - Quelle ${suffix}`;
    const targetBankName = `${TEST_QUESTION_BANK_NAME} - Ziel ${suffix}`;
    const sourceCategoryName = `7.3 Quelle ${suffix}`;
    const childCategoryName = `7.3.1 Unterkategorie ${suffix}`;
    const targetParentName = `9.1 Zielordner ${suffix}`;
    const renamedCategoryName = `9.2 Verschoben ${suffix}`;

    let sourceBank;
    let targetBank;

    try {
      sourceBank = await callMoodle('local_aicoursecreator_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID,
        name: sourceBankName,
      });
      targetBank = await callMoodle('local_aicoursecreator_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID,
        name: targetBankName,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion fuer Fragensammlungen noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    const sourceCategory = await callMoodle('local_aicoursecreator_create_question_category', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: sourceBank.questionbankid,
      name: sourceCategoryName,
    });
    const childCategory = await callMoodle('local_aicoursecreator_create_question_category', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: sourceBank.questionbankid,
      name: childCategoryName,
      parent: sourceCategory.id,
    });
    const targetParent = await callMoodle('local_aicoursecreator_create_question_category', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: targetBank.questionbankid,
      name: targetParentName,
    });

    let moved;
    try {
      moved = await callMoodle('local_aicoursecreator_update_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        categoryid: sourceCategory.id,
        questionbankid: targetBank.questionbankid,
        name: renamedCategoryName,
        parent: targetParent.id,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion lokal_aicoursecreator_update_question_category noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(moved.id, sourceCategory.id);
    assert.strictEqual(moved.name, renamedCategoryName);
    assert.strictEqual(moved.parent, targetParent.id);
    assert.strictEqual(moved.moved, true);
    assert.strictEqual(moved.renamed, true);
    assert.ok(moved.updatedcategories >= 2, 'Die verschobene Unterstruktur sollte mindestens Haupt- und Unterkategorie enthalten');

    const sourceCategoriesAfter = await callMoodle('local_aicoursecreator_get_question_categories', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: sourceBank.questionbankid,
    });
    const targetCategoriesAfter = await callMoodle('local_aicoursecreator_get_question_categories', {
      courseid: MOODLE_TEST_COURSEID,
      questionbankid: targetBank.questionbankid,
    });

    assert.equal(sourceCategoriesAfter.some((c) => c.id === sourceCategory.id), false,
      'Die verschobene Hauptkategorie darf nicht in der Quell-Fragensammlung bleiben');
    assert.equal(sourceCategoriesAfter.some((c) => c.id === childCategory.id), false,
      'Unterkategorien muessen mitverschoben werden');

    const movedCategory = targetCategoriesAfter.find((c) => c.id === sourceCategory.id);
    const movedChildCategory = targetCategoriesAfter.find((c) => c.id === childCategory.id);
    assert.ok(movedCategory, 'Die Hauptkategorie muss in der Ziel-Fragensammlung auftauchen');
    assert.ok(movedChildCategory, 'Unterkategorien muessen in der Ziel-Fragensammlung auftauchen');
    assert.strictEqual(movedCategory.name, renamedCategoryName);
    assert.strictEqual(movedCategory.parent, targetParent.id);
    assert.strictEqual(movedChildCategory.parent, sourceCategory.id);
  }
);

test(
  'local_aicoursecreator_create_question_category lehnt Nutzer ohne moodle/question:managecategory im Fragenbank-Kontext ab',
  { skip: !hasNoManagecategoryTestConfig && SKIP_REASON_NO_MANAGECATEGORY },
  async (t) => {
    let questionBank;
    try {
      questionBank = await callMoodle('local_aicoursecreator_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID,
        name: TEST_QUESTION_BANK_NAME,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion lokal_aicoursecreator_ensure_question_bank noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    await assert.rejects(
      () => callMoodleAsUserWithoutManagecategory('local_aicoursecreator_create_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        questionbankid: questionBank.questionbankid,
        name: `${TEST_CATEGORY_NAME} (ohne Recht)`,
      }),
      (err) => {
        assert.match(err.message, /nopermissions|require_capability|managecategory/i);
        return true;
      },
      'Nutzer ohne moodle/question:managecategory im Fragenbank-Kontext darf keine Kategorie anlegen'
    );
  }
);

test(
  'local_aicoursecreator_update_question_category lehnt Nutzer ohne moodle/question:managecategory im Ziel-Fragenbank-Kontext ab',
  { skip: !hasNoManagecategoryTestConfig && SKIP_REASON_NO_MANAGECATEGORY },
  async (t) => {
    const suffix = Date.now();
    let questionBank;
    let category;
    try {
      questionBank = await callMoodle('local_aicoursecreator_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID,
        name: `${TEST_QUESTION_BANK_NAME} - Rechtetest ${suffix}`,
      });
      category = await callMoodle('local_aicoursecreator_create_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        questionbankid: questionBank.questionbankid,
        name: `7.4 Rechtetest ${suffix}`,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion fuer Fragensammlungen noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    await assert.rejects(
      () => callMoodleAsUserWithoutManagecategory('local_aicoursecreator_update_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        categoryid: category.id,
        questionbankid: questionBank.questionbankid,
        name: `7.4 Rechtetest umbenannt ${suffix}`,
      }),
      (err) => {
        assert.match(err.message, /nopermissions|require_capability|managecategory/i);
        return true;
      },
      'Nutzer ohne moodle/question:managecategory im Ziel-Fragenbank-Kontext darf Kategorie nicht aendern'
    );
  }
);
