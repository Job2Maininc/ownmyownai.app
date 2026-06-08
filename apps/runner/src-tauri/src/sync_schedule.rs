use chrono::{DateTime, Datelike, Local, Timelike};

#[derive(Debug, Clone)]
pub struct CronSchedule {
    pub minute: u8,
    pub hour: u8,
    pub day_of_month: CronField,
    pub month: CronField,
    pub day_of_week: CronField,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CronField {
    Any,
    Value(u8),
}

/// Parse a 5-field cron expression (`minute hour dom month dow`).
pub fn parse_cron_expression(expr: &str) -> Result<CronSchedule, String> {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() != 5 {
        return Err(format!(
            "Expression cron invalide (5 champs requis) : {expr}"
        ));
    }

    Ok(CronSchedule {
        minute: parse_cron_number(parts[0], 0, 59, "minute")?,
        hour: parse_cron_number(parts[1], 0, 23, "heure")?,
        day_of_month: parse_cron_field(parts[2], 1, 31, "jour du mois")?,
        month: parse_cron_field(parts[3], 1, 12, "mois")?,
        day_of_week: parse_cron_field(parts[4], 0, 6, "jour de la semaine")?,
    })
}

fn parse_cron_number(raw: &str, min: u8, max: u8, label: &str) -> Result<u8, String> {
    let n: u8 = raw
        .parse()
        .map_err(|_| format!("Champ {label} invalide : {raw}"))?;
    if n < min || n > max {
        return Err(format!("Champ {label} hors limites ({min}-{max}) : {raw}"));
    }
    Ok(n)
}

fn parse_cron_field(raw: &str, min: u8, max: u8, label: &str) -> Result<CronField, String> {
    if raw == "*" {
        return Ok(CronField::Any);
    }
    Ok(CronField::Value(parse_cron_number(raw, min, max, label)?))
}

fn cron_field_matches(field: CronField, value: u8) -> bool {
    match field {
        CronField::Any => true,
        CronField::Value(v) => v == value,
    }
}

pub fn cron_matches(schedule: &CronSchedule, dt: &DateTime<Local>) -> bool {
    if dt.minute() as u8 != schedule.minute || dt.hour() as u8 != schedule.hour {
        return false;
    }
    cron_field_matches(schedule.day_of_month, dt.day() as u8)
        && cron_field_matches(schedule.month, dt.month() as u8)
        && cron_field_matches(schedule.day_of_week, dt.weekday().num_days_from_sunday() as u8)
}

pub fn next_cron_run(schedule: &CronSchedule, after: DateTime<Local>) -> Option<DateTime<Local>> {
    let mut candidate = after
        + chrono::Duration::minutes(1)
            - chrono::Duration::seconds(after.second() as i64)
            - chrono::Duration::nanoseconds(after.nanosecond() as i64);

    for _ in 0..(366 * 24 * 60) {
        if cron_matches(schedule, &candidate) {
            return Some(candidate);
        }
        candidate += chrono::Duration::minutes(1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn parses_daily_cron() {
        let s = parse_cron_expression("0 3 * * *").unwrap();
        assert_eq!(s.minute, 0);
        assert_eq!(s.hour, 3);
        assert_eq!(s.day_of_month, CronField::Any);
    }

    #[test]
    fn rejects_invalid_cron() {
        assert!(parse_cron_expression("0 3 * *").is_err());
        assert!(parse_cron_expression("60 3 * * *").is_err());
    }

    #[test]
    fn matches_daily_slot() {
        let s = parse_cron_expression("30 14 * * *").unwrap();
        let dt = Local.with_ymd_and_hms(2026, 6, 8, 14, 30, 0).unwrap();
        assert!(cron_matches(&s, &dt));
        let other = Local.with_ymd_and_hms(2026, 6, 8, 14, 31, 0).unwrap();
        assert!(!cron_matches(&s, &other));
    }

    #[test]
    fn next_run_is_same_day_when_before_slot() {
        let s = parse_cron_expression("0 3 * * *").unwrap();
        let after = Local.with_ymd_and_hms(2026, 6, 8, 1, 0, 0).unwrap();
        let next = next_cron_run(&s, after).unwrap();
        assert_eq!(next.hour(), 3);
        assert_eq!(next.minute(), 0);
        assert_eq!(next.day(), 8);
    }
}
