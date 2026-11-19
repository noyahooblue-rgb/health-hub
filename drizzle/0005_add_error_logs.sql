CREATE TABLE `error_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`detail` text
);
