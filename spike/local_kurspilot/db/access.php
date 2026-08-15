<?php
// SPIKE — Wegwerfcode zu Issue #294. Kein Produktionscode.

defined('MOODLE_INTERNAL') || die();

$capabilities = [
    'local/kurspilot:use' => [
        'captype' => 'read',
        'contextlevel' => CONTEXT_COURSE,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'teacher' => CAP_ALLOW,
        ],
    ],
];
