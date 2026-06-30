use super::store::get_knowledge_base_system_instructions;

/// Per-knowledge-base system instructions (order preserved).
pub fn collect_kb_system_instructions(context_ids: &[String]) -> Result<Vec<String>, String> {
    get_knowledge_base_system_instructions(context_ids)
}

pub fn prepend_kb_system_instructions(
    messages: &mut Vec<serde_json::Value>,
    context_ids: &[String],
) -> Result<(), String> {
    let blocks = collect_kb_system_instructions(context_ids)?;
    for block in blocks.iter().rev() {
        messages.insert(
            0,
            serde_json::json!({ "role": "system", "content": block }),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::store::{
        create_knowledge_base, init_db, set_knowledge_base_system_instruction, test_db_lock,
        ContextLimits,
    };

    #[test]
    fn kb_instruction_collected_for_active_context() {
        let _guard = test_db_lock();
        init_db().expect("init db");
        let kb = create_knowledge_base("KB", "", &ContextLimits::default()).unwrap();
        set_knowledge_base_system_instruction(&kb.id, "Réponds en français.").unwrap();

        let blocks = collect_kb_system_instructions(&[kb.id.clone()]).unwrap();
        assert_eq!(blocks, vec!["Réponds en français."]);
    }
}
