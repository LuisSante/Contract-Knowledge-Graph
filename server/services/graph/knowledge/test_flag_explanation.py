"""Pruebas sin peticiones de pago ni almacenamiento de explicaciones."""

import json
import unittest
from unittest.mock import Mock, patch

from services.graph.knowledge.flag_explanation import (
    MODEL,
    build_context,
    estimate_explanation,
    generate_explanation,
    validate_explanation,
)


class FlagExplanationTests(unittest.TestCase):
    def setUp(self):
        self.kg = {
            "parties": [{"id": "a", "name": "Arrendador"}, {"id": "b", "name": "Arrendatario"}],
            "clauses": [{"id": "c", "heading": "Servicios"}, {"id": "parent", "heading": "Contrato"}],
            "obligations": [
                {
                    "id": "o",
                    "action": "Pagar servicios",
                    "text": "B paga los servicios.",
                    "evidenceSpans": ["B paga los servicios."],
                    "burdenPartyId": "b",
                    "benefitPartyId": "a",
                    "clauseId": "c",
                }
            ],
            "conditions": [{"id": "if", "trigger": "Si se consumen", "gatesId": "o"}],
            "edges": [
                {"source": "o", "type": "is_part_of", "target": "c"},
                {"source": "c", "type": "is_part_of", "target": "parent"},
                {"source": "o", "type": "contradicts", "target": "c"},
            ],
        }
        self.context = build_context(
            self.kg, "o", ["o", "c", "a", "b", "if", "parent"], [{"type": "services_charges", "text": "B paga los servicios."}]
        )
        self.reply = {
            "status": "partial",
            "summary": "B asume los gastos.",
            "exposedPartyIds": ["b"],
            "reasons": [
                {
                    "id": "explanation-1",
                    "concept": "Exposición al pago",
                    "kind": "interpretation",
                    "targetId": "b",
                    "relation": "exposes to costs",
                    "evidenceIds": ["o"],
                }
            ],
        }

    def test_context_preserves_direction_and_literal_condition(self):
        self.assertEqual([(e["source"], e["type"], e["target"]) for e in self.context["edges"]], [("o", "is_part_of", "c")])
        self.assertIn({"id": "field:if:gatesId", "source": "if", "field": "gatesId", "target": "o"}, self.context["fields"])
        self.assertEqual(next(e["quote"] for e in self.context["evidence"] if e["id"] == "o"), "B paga los servicios.")

    def test_unknown_node_rejected_before_call(self):
        with self.assertRaises(ValueError):
            build_context(self.kg, "o", ["o", "inventado"], [{"text": "texto"}])

    def test_invented_citation_rejected(self):
        self.reply["reasons"][0]["evidenceIds"] = ["inventado"]
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)

    def test_invented_party_rejected(self):
        self.reply["exposedPartyIds"] = ["otra parte"]
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)

    def test_invented_target_rejected(self):
        self.reply["reasons"][0]["targetId"] = "nodo inventado"
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)

    def test_gap_is_anchored_without_becoming_a_risk_reason(self):
        self.reply["reasons"] = [
            {
                "id": "explanation-1",
                "concept": "Importe no registrado",
                "kind": "missing_information",
                "targetId": "o",
                "relation": "prevents estimating",
                "evidenceIds": ["o"],
            }
        ]
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)
        self.reply["status"] = "insufficient"
        result = validate_explanation(json.dumps(self.reply), self.context)
        self.assertEqual(result.reasons[0].targetId, "o")
        self.assertEqual(result.reasons[0].relation, "prevents estimating")

    def test_concept_chain_ends_at_existing_node(self):
        self.reply["reasons"].append(
            {
                "id": "explanation-2",
                "concept": "Tarifas ausentes del camino",
                "kind": "missing_information",
                "targetId": "explanation-1",
                "relation": "impiden cuantificar",
                "evidenceIds": ["o"],
            }
        )
        result = validate_explanation(json.dumps(self.reply), self.context)
        self.assertEqual(result.reasons[1].targetId, result.reasons[0].id)
        self.assertEqual(result.reasons[0].targetId, "b")

    def test_self_reference_and_cycles_are_rejected(self):
        self.reply["reasons"][0]["targetId"] = "explanation-1"
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)
        self.reply["reasons"][0]["targetId"] = "explanation-2"
        self.reply["reasons"].append({**self.reply["reasons"][0], "id": "explanation-2", "targetId": "explanation-1"})
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)

    def test_duplicate_concept_ids_are_rejected(self):
        self.reply["reasons"].append(dict(self.reply["reasons"][0]))
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)

    def test_repeated_body_and_overlong_concepts_are_rejected(self):
        reason = self.reply["reasons"][0]
        reason["explanation"] = "Un párrafo duplicado."
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)
        del reason["explanation"]
        reason["concept"] = "x" * 49
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)

    def test_relation_is_short_without_silent_truncation(self):
        reason = self.reply["reasons"][0]
        reason["relation"] = "prevent estimating financial exposure under"
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)
        reason["relation"] = "can increase costs for"
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)
        reason["relation"] = "increase costs for"
        result = validate_explanation(json.dumps(self.reply), self.context)
        self.assertEqual(result.reasons[0].relation, "increase costs for")

    def test_explanation_requires_reasons_but_can_report_insufficient(self):
        self.reply["reasons"] = []
        with self.assertRaises(ValueError):
            validate_explanation(json.dumps(self.reply), self.context)
        self.reply["status"] = "insufficient"
        self.assertEqual(validate_explanation(json.dumps(self.reply), self.context).status, "insufficient")

    @patch("services.graph.knowledge.flag_explanation.LLMProviderFactory.create")
    def test_estimate_never_calls_provider(self, create):
        result = estimate_explanation(self.context)
        create.assert_not_called()
        self.assertEqual(result["model"], MODEL)
        self.assertGreater(result["outputBudgetCostUsd"], result["estimatedCostUsd"])

    @patch("services.graph.knowledge.flag_explanation.LLMProviderFactory.create")
    def test_structured_call_uses_requested_model_once(self, create):
        provider = Mock()
        provider.generate.return_value = json.dumps(self.reply)
        create.return_value = provider
        result = generate_explanation(self.context)
        create.assert_called_once_with("openai", model="gpt-6.1-sol", reasoning_effort="low", max_retries=0)
        self.assertEqual(result["explanation"], self.reply)
        self.assertTrue(all(set(link) == {"id", "nodeIds"} for link in result["evidence"]))
        self.assertEqual(provider.generate.call_count, 1)
        self.assertEqual(provider.generate.call_args.kwargs["max_output_tokens"], 4000)
        self.assertFalse(provider.generate.call_args.kwargs["json_schema"]["schema"]["additionalProperties"])
