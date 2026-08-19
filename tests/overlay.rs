use dsh_exec_extension::{overlay_selection, Effort, ModelSelection, SelectionOverrides};

fn base(effort: Option<Effort>) -> ModelSelection {
    ModelSelection {
        provider: "deepseek-official".into(),
        model: "deepseek-v4-flash".into(),
        reasoning_effort: effort,
    }
}

#[test]
fn omitted_flags_match_stock_selection() {
    let next = overlay_selection(base(None), &SelectionOverrides::default());
    assert_eq!(next, base(None));
}

#[test]
fn omitted_effort_does_not_inject_a_tier() {
    let next = overlay_selection(
        base(None),
        &SelectionOverrides {
            model: Some("deepseek-v4-pro".into()),
            ..SelectionOverrides::default()
        },
    );
    assert_eq!(next.model, "deepseek-v4-pro");
    assert_eq!(next.provider, "deepseek-official");
    assert_eq!(next.reasoning_effort, None);
}

#[test]
fn omitted_effort_keeps_deployment_effort() {
    let next = overlay_selection(
        base(Some(Effort::High)),
        &SelectionOverrides {
            model: Some("other".into()),
            ..SelectionOverrides::default()
        },
    );
    assert_eq!(next.reasoning_effort, Some(Effort::High));
}

#[test]
fn present_effort_replaces_deployment_effort() {
    let next = overlay_selection(
        base(Some(Effort::High)),
        &SelectionOverrides {
            effort: Some(Effort::Max),
            ..SelectionOverrides::default()
        },
    );
    assert_eq!(next.reasoning_effort, Some(Effort::Max));
}

#[test]
fn present_provider_replaces_deployment_provider() {
    let next = overlay_selection(
        base(None),
        &SelectionOverrides {
            provider: Some("custom-route".into()),
            ..SelectionOverrides::default()
        },
    );
    assert_eq!(next.provider, "custom-route");
    assert_eq!(next.model, "deepseek-v4-flash");
}

#[test]
fn model_ids_are_used_verbatim() {
    let next = overlay_selection(
        base(None),
        &SelectionOverrides {
            model: Some("gpt-5.5".into()),
            ..SelectionOverrides::default()
        },
    );
    assert_eq!(next.model, "gpt-5.5");
}

#[test]
fn concurrent_overlays_do_not_share_state() {
    let a = overlay_selection(
        base(None),
        &SelectionOverrides {
            model: Some("model-a".into()),
            effort: Some(Effort::Max),
            ..SelectionOverrides::default()
        },
    );
    let b = overlay_selection(
        base(None),
        &SelectionOverrides {
            model: Some("model-b".into()),
            effort: Some(Effort::Off),
            ..SelectionOverrides::default()
        },
    );
    assert_eq!(a.model, "model-a");
    assert_eq!(a.reasoning_effort, Some(Effort::Max));
    assert_eq!(b.model, "model-b");
    assert_eq!(b.reasoning_effort, Some(Effort::Off));
    assert_eq!(base(None).model, "deepseek-v4-flash");
}

#[test]
fn overlay_json_round_trip_skips_absent_effort() {
    let json = serde_json::to_string(&overlay_selection(
        ModelSelection {
            provider: "p".into(),
            model: "m".into(),
            reasoning_effort: None,
        },
        &SelectionOverrides::default(),
    ))
    .unwrap();
    assert!(!json.contains("reasoningEffort"), "{json}");
}
