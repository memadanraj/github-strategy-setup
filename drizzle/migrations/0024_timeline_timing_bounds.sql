-- Bound clip/caption timing and text sizes at the database boundary.
-- NOT VALID prevents this migration from silently rewriting existing project data.
-- Inspect existing violations in staging and then VALIDATE these constraints once
-- any outliers are reviewed and corrected with the project owner.

alter table public.timeline_clips
  add constraint timeline_clips_time_upper_bounds
    check (
      start_seconds <= 86400
      and duration_seconds <= 86400
      and source_start_seconds <= 86400
      and start_seconds + duration_seconds <= 86400
    ) not valid,
  add constraint timeline_clips_transition_length_bounds
    check (
      (transition_in is null or char_length(transition_in) <= 80)
      and (transition_out is null or char_length(transition_out) <= 80)
    ) not valid;

alter table public.captions
  add constraint captions_time_and_text_upper_bounds
    check (
      start_seconds <= 86400
      and end_seconds <= 86400
      and char_length(text) <= 5000
    ) not valid;

alter table public.timeline_settings
  add constraint timeline_settings_grid_lower_bound
    check (grid_seconds >= 0.1) not valid;

comment on constraint timeline_clips_time_upper_bounds on public.timeline_clips is
  'Prevents non-finite/oversized clip times and clips that extend beyond the 24-hour timeline limit.';
comment on constraint timeline_clips_transition_length_bounds on public.timeline_clips is
  'Keeps transition identifiers within the client-supported 80-character limit.';
comment on constraint captions_time_and_text_upper_bounds on public.captions is
  'Limits caption timing to 24 hours and text to 5000 characters.';
comment on constraint timeline_settings_grid_lower_bound on public.timeline_settings is
  'Matches client validation: timeline grid values must be at least 0.1 seconds.';
