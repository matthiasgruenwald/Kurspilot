<?php
// SPIKE — Wegwerfcode zu Issue #294. Kein Produktionscode.

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_kurspilot_list_courses' => [
        'classname'   => 'local_kurspilot\external\list_courses',
        'description' => 'Lists the courses the calling teacher may use Kurspilot in.',
        'type'        => 'read',
        'ajax'        => false,
    ],
];

$services = [
    'Kurspilot (Spike)' => [
        'functions' => ['local_kurspilot_list_courses'],
        'restrictedusers' => 0,
        'enabled' => 1,
        'shortname' => 'kurspilot_spike',
    ],
];
