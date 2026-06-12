<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

defined('MOODLE_INTERNAL') || die();

$functions = [

    'local_aicoursecreator_upload_assignfile' => [
        'classname'     => 'local_aicoursecreator\external\upload_assignfile',
        'description'   => 'Uploads a file (Base64) as additional attachment to a mod_assign activity.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_set_completion' => [
        'classname'     => 'local_aicoursecreator\external\set_completion',
        'description'   => 'Activates activity completion tracking (manual or automatic on submit).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_set_restriction' => [
        'classname'     => 'local_aicoursecreator\external\set_restriction',
        'description'   => 'Sets access restrictions based on completion of other modules.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_update_label' => [
        'classname'     => 'local_aicoursecreator\external\update_label',
        'description'   => 'Updates the HTML content of an existing label (Text- und Medienfeld).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_update_url' => [
        'classname'     => 'local_aicoursecreator\external\update_url',
        'description'   => 'Updates name and/or URL of an existing external link (mod_url).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_get_modules' => [
        'classname'     => 'local_aicoursecreator\external\get_modules',
        'description'   => 'Returns all activities in a course or section with their cmids.',
        'type'          => 'read',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:view',
    ],

    'local_aicoursecreator_update_page' => [
        'classname'     => 'local_aicoursecreator\external\update_page',
        'description'   => 'Updates title and/or content of an existing page (mod_page).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_update_assign' => [
        'classname'     => 'local_aicoursecreator\external\update_assign',
        'description'   => 'Updates title, description and/or due date of an existing assignment.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_create_url' => [
        'classname'     => 'local_aicoursecreator\external\create_url',
        'description'   => 'Creates a URL/Link (mod_url) activity in a course section.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    'local_aicoursecreator_create_label' => [
        'classname'     => 'local_aicoursecreator\external\create_label',
        'description'   => 'Creates a Label (mod_label / Text- und Medienfeld) in a course section.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    // ----------------------------------------------------------------
    // Create a Page (Textseite) in a course section
    // ----------------------------------------------------------------
    'local_aicoursecreator_create_page' => [
        'classname'     => 'local_aicoursecreator\external\create_page',
        'description'   => 'Creates a Page (mod_page) activity in a given course section.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    // ----------------------------------------------------------------
    // Create an Assignment (Aufgabe) in a course section
    // ----------------------------------------------------------------
    'local_aicoursecreator_create_assign' => [
        'classname'     => 'local_aicoursecreator\external\create_assign',
        'description'   => 'Creates an Assignment (mod_assign) activity in a given course section.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    // ----------------------------------------------------------------
    // Update section name and summary
    // ----------------------------------------------------------------
    'local_aicoursecreator_update_section' => [
        'classname'     => 'local_aicoursecreator\external\update_section',
        'description'   => 'Updates the name and summary of a course section.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:update',
    ],

    // ----------------------------------------------------------------
    // Get course sections (read existing structure)
    // ----------------------------------------------------------------
    'local_aicoursecreator_get_sections' => [
        'classname'     => 'local_aicoursecreator\external\get_sections',
        'description'   => 'Returns all sections of a course with their ids and names.',
        'type'          => 'read',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:view',
    ],

    // ----------------------------------------------------------------
    // Create a Quiz (Lerncheck) in a course section
    // ----------------------------------------------------------------
    'local_aicoursecreator_create_quiz' => [
        'classname'     => 'local_aicoursecreator\external\create_quiz',
        'description'   => 'Creates a Quiz (mod_quiz) activity with Lerncheck defaults (unbegrenzte Versuche, beste Bewertung, kein Zeitlimit, gemischte Antworten) in a given course section.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:manageactivities',
    ],

    // ----------------------------------------------------------------
    // Question bank categories (per Unterthema/Inhaltsabschnitt)
    // ----------------------------------------------------------------
    'local_aicoursecreator_create_question_category' => [
        'classname'     => 'local_aicoursecreator\external\create_question_category',
        'description'   => 'Creates a question bank category in the course question context (idempotent: returns existing id if a category with the same name already exists under the same parent).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/question:managecategory',
    ],

    'local_aicoursecreator_get_question_categories' => [
        'classname'     => 'local_aicoursecreator\external\get_question_categories',
        'description'   => 'Returns all question bank categories of the course question context, including the top category.',
        'type'          => 'read',
        'ajax'          => false,
        'capabilities'  => 'moodle/course:view',
    ],

    // ----------------------------------------------------------------
    // Multiple-Choice-Fragen mit nativer Moodle-Versionierung (#9, ADR-0001)
    // ----------------------------------------------------------------
    'local_aicoursecreator_create_mc_question' => [
        'classname'     => 'local_aicoursecreator\external\create_mc_question',
        'description'   => 'Creates a Multiple-Choice question (qtype_multichoice) in a question bank category. V1 rules: single correct answer, variable options, shuffleanswers, no partial credit.',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/question:add',
    ],

    'local_aicoursecreator_update_mc_question' => [
        'classname'     => 'local_aicoursecreator\external\update_mc_question',
        'description'   => 'Updates a Multiple-Choice question as a NEW Moodle question version (same questionbankentryid). Old version stays valid for existing quiz attempts (ADR-0001).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'moodle/question:add',
    ],

    'local_aicoursecreator_get_question' => [
        'classname'     => 'local_aicoursecreator\external\get_question',
        'description'   => 'Returns the latest version of a question in a category, identified by name or questionid. Used to look up a question before editing.',
        'type'          => 'read',
        'ajax'          => false,
        'capabilities'  => 'moodle/question:view',
    ],
];

$services = [
    'AI Course Creator Service' => [
        'functions'       => [
            'local_aicoursecreator_upload_assignfile',
            'local_aicoursecreator_set_completion',
            'local_aicoursecreator_set_restriction',
            'local_aicoursecreator_update_label',
            'local_aicoursecreator_update_url',
            'local_aicoursecreator_get_modules',
            'local_aicoursecreator_update_page',
            'local_aicoursecreator_update_assign',
            'local_aicoursecreator_create_url',
            'local_aicoursecreator_create_label',
            'local_aicoursecreator_create_page',
            'local_aicoursecreator_create_assign',
            'local_aicoursecreator_update_section',
            'local_aicoursecreator_get_sections',
            'local_aicoursecreator_create_quiz',
            'local_aicoursecreator_create_question_category',
            'local_aicoursecreator_get_question_categories',
            'local_aicoursecreator_create_mc_question',
            'local_aicoursecreator_update_mc_question',
            'local_aicoursecreator_get_question',
        ],
        'restrictedusers' => 1,
        'enabled'         => 1,
        'shortname'       => 'ai_course_creator',
    ],
];
