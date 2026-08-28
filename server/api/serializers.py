"""DRF serializers for the document + graph API.

These are plain `Serializer`s (not `ModelSerializer`) because the data is
computed/validated, never persisted. Output serialization reads attributes off
the Pydantic domain objects returned by the service layer.
"""

from rest_framework import serializers


class DatasetDocumentSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    full_path = serializers.CharField()
    relative_path = serializers.CharField(default="")
    group_label = serializers.CharField(default="root")
    display_name = serializers.CharField(default="")
    origin = serializers.ChoiceField(choices=["dataset", "upload"])
    processed = serializers.BooleanField()


class NodeSerializer(serializers.Serializer):
    id = serializers.CharField()
    documentId = serializers.CharField()
    text = serializers.CharField(allow_blank=True)
    paragraph_enum = serializers.IntegerField()
    page = serializers.IntegerField()
    relationsCount = serializers.IntegerField(default=0)


class EdgeSerializer(serializers.Serializer):
    source = serializers.CharField()
    target = serializers.CharField()
    type = serializers.CharField()
    score = serializers.FloatField(required=False, allow_null=True)
    ref_label = serializers.CharField(required=False, allow_null=True)
    ref_value = serializers.CharField(required=False, allow_null=True)


class GraphSerializer(serializers.Serializer):
    nodes = NodeSerializer(many=True)
    edges = EdgeSerializer(many=True)


class ProcessElementSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)
    text = serializers.CharField(required=False, allow_blank=True, default="")


class ProcessPageSerializer(serializers.Serializer):
    pageNumber = serializers.IntegerField(required=False, allow_null=True)
    elements = ProcessElementSerializer(many=True, required=False, default=list)


class ProcessDocumentRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    pages = ProcessPageSerializer(many=True, required=False, default=list)


class ExtractParagraphsResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    documentId = serializers.CharField()
    enabled = serializers.BooleanField()
    saved = serializers.IntegerField()
    path = serializers.CharField(required=False, allow_null=True)


class ProcessCacheMetaSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(default=False)
    hit = serializers.BooleanField(default=False)
    key = serializers.CharField(required=False, allow_null=True)


class ProcessDocumentResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    documentId = serializers.CharField()
    graph = GraphSerializer()
    cache = ProcessCacheMetaSerializer()


# ---------------------------------------------------------------------------
# Phase 2 — Assistant serializers (mirror schemas/assistant.py)
# ---------------------------------------------------------------------------

_ASSISTANT_MODE_CHOICES = ["explain", "suggest_questions"]
_ASSISTANT_SCOPE_CHOICES = ["selected", "full_contract"]
_ASSISTANT_PROVIDER_CHOICES = ["openai"]
_ASSISTANT_ROLE_CHOICES = ["user", "assistant"]
_RELATION_TYPE_CHOICES = ["reference", "semantic_similarity"]


class AssistantParagraphNodeSerializer(serializers.Serializer):
    id = serializers.CharField()
    text = serializers.CharField(allow_blank=True)
    paragraph_enum = serializers.IntegerField()
    page = serializers.IntegerField()


class AssistantRelatedParagraphSerializer(serializers.Serializer):
    id = serializers.CharField()
    relationTypes = serializers.ListField(
        child=serializers.ChoiceField(choices=_RELATION_TYPE_CHOICES),
        required=False,
        default=list,
    )
    semanticScore = serializers.FloatField(required=False, allow_null=True)
    references = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class AssistantHistoryMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=_ASSISTANT_ROLE_CHOICES)
    content = serializers.CharField(allow_blank=True)


class AssistantChatRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    question = serializers.CharField(allow_blank=True)
    mode = serializers.ChoiceField(choices=_ASSISTANT_MODE_CHOICES, default="explain")
    scope = serializers.ChoiceField(choices=_ASSISTANT_SCOPE_CHOICES, default="selected")
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES, default="openai")
    model = serializers.CharField(required=False, allow_null=True)
    selectedParagraphId = serializers.CharField(required=False, allow_null=True)
    relatedParagraphs = AssistantRelatedParagraphSerializer(many=True, required=False, default=list)
    paragraphNodes = AssistantParagraphNodeSerializer(many=True)
    history = AssistantHistoryMessageSerializer(many=True, required=False, default=list)


class AssistantCitationSerializer(serializers.Serializer):
    id = serializers.CharField()
    excerpt = serializers.CharField(allow_blank=True)
    page = serializers.IntegerField(required=False, allow_null=True)
    paragraph_enum = serializers.IntegerField(required=False, allow_null=True)


class AssistantChatResponseSerializer(serializers.Serializer):
    answer = serializers.CharField(allow_blank=True)
    citations = AssistantCitationSerializer(many=True)
    suggestedQuestions = serializers.ListField(child=serializers.CharField())
    mode = serializers.ChoiceField(choices=_ASSISTANT_MODE_CHOICES)
    scope = serializers.ChoiceField(choices=_ASSISTANT_SCOPE_CHOICES)
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES)


class SimplifyEvidenceSerializer(serializers.Serializer):
    paragraph_id = serializers.CharField()
    selection_start = serializers.IntegerField()
    selection_end = serializers.IntegerField()


class SimplifyAuditSerializer(serializers.Serializer):
    system_prompt = serializers.CharField(allow_blank=True)
    user_prompt = serializers.CharField(allow_blank=True)
    model_response = serializers.CharField(allow_blank=True)


class SimplifyRelatedParagraphSerializer(serializers.Serializer):
    id = serializers.CharField()
    text = serializers.CharField(allow_blank=True)
    paragraph_enum = serializers.IntegerField(required=False, allow_null=True)
    page = serializers.IntegerField(required=False, allow_null=True)
    relationTypes = serializers.ListField(
        child=serializers.ChoiceField(choices=_RELATION_TYPE_CHOICES),
        required=False,
        default=list,
    )
    semanticScore = serializers.FloatField(required=False, allow_null=True)
    references = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class SimplifySelectionRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES, default="openai")
    paragraphId = serializers.CharField()
    paragraphText = serializers.CharField(allow_blank=True)
    selectionStart = serializers.IntegerField(default=0)
    selectionEnd = serializers.IntegerField(default=0)
    contradictionReason = serializers.CharField(required=False, allow_null=True)
    relatedParagraphs = SimplifyRelatedParagraphSerializer(many=True, required=False, default=list)


class SimplifySelectionResponseSerializer(serializers.Serializer):
    paragraphId = serializers.CharField()
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES)
    originalSnippet = serializers.CharField(allow_blank=True)
    simplifiedSnippet = serializers.CharField(allow_blank=True)
    evidence = SimplifyEvidenceSerializer()
    audit = SimplifyAuditSerializer()


# ---------------------------------------------------------------------------
# Phase 2 — Contradiction serializers (mirror schemas/contradictions.py)
# ---------------------------------------------------------------------------

_GRAPH_MODE_CHOICES = ["with_kg", "without_kg"]
_TAXONOMY_CHOICES = [
    "temporal",
    "numerical",
    "authority",
    "process",
    "policy_reversal",
    "specificity",
]
_EVIDENCE_SOURCE_CHOICES = ["paragraph", "context", "unknown"]
_EVIDENCE_STATUS_CHOICES = ["exact", "missing", "approximate"]


class ContradictionEvidenceSerializer(serializers.Serializer):
    snippet_a = serializers.CharField(allow_blank=True, default="")
    snippet_b = serializers.CharField(allow_blank=True, default="")
    source_a = serializers.ChoiceField(choices=_EVIDENCE_SOURCE_CHOICES, default="unknown")
    source_b = serializers.ChoiceField(choices=_EVIDENCE_SOURCE_CHOICES, default="unknown")
    evidence_status = serializers.ChoiceField(choices=_EVIDENCE_STATUS_CHOICES, default="missing")
    evidence_note = serializers.CharField(allow_blank=True, default="")


class ContradictionFindingSerializer(serializers.Serializer):
    confidence = serializers.IntegerField(min_value=0, max_value=100)
    brief_reason = serializers.CharField(allow_blank=True, default="")
    contradiction_type = serializers.ChoiceField(
        choices=_TAXONOMY_CHOICES, required=False, allow_null=True
    )
    evidence = ContradictionEvidenceSerializer(required=False, allow_null=True)


class ContradictionParagraphResultSerializer(serializers.Serializer):
    paragraph_id = serializers.CharField()
    contradiction = serializers.BooleanField()
    confidence = serializers.IntegerField(min_value=0, max_value=100)
    brief_reason = serializers.CharField(allow_blank=True, default="")
    contradiction_type = serializers.ChoiceField(
        choices=_TAXONOMY_CHOICES, required=False, allow_null=True
    )
    evidence = ContradictionEvidenceSerializer(required=False, allow_null=True)
    contradictions = ContradictionFindingSerializer(many=True, required=False, default=list)


class ContradictionAnalysisRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    graph = GraphSerializer()
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES, default="openai")
    temperature = serializers.FloatField(default=0.1)
    model = serializers.CharField(required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=_GRAPH_MODE_CHOICES, default="without_kg")


class ContradictionAnalysisResponseSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES)
    temperature = serializers.FloatField()
    model = serializers.CharField(required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=_GRAPH_MODE_CHOICES, default="without_kg")
    paragraphResults = ContradictionParagraphResultSerializer(many=True)
    rawResponse = serializers.CharField(allow_blank=True)


class SavedContradictionsResponseSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    sourceFile = serializers.CharField()
    mode = serializers.ChoiceField(choices=_GRAPH_MODE_CHOICES)
    paragraphResults = ContradictionParagraphResultSerializer(many=True)


# ---------------------------------------------------------------------------
# Phase 2 — LLM serializers (mirror schemas/llm.py)
# ---------------------------------------------------------------------------

_LLM_CALL_TYPE_CHOICES = [
    "assistant_chat",
    "assistant_simplify",
    "assistant_fix_contradiction",
    "contradictions_analyze",
]


class LlmEstimateRequestSerializer(serializers.Serializer):
    callType = serializers.ChoiceField(choices=_LLM_CALL_TYPE_CHOICES)
    assistantChat = AssistantChatRequestSerializer(required=False, allow_null=True)
    simplifySelection = SimplifySelectionRequestSerializer(required=False, allow_null=True)
    contradictionAnalysis = ContradictionAnalysisRequestSerializer(required=False, allow_null=True)


class LlmEstimateResponseSerializer(serializers.Serializer):
    callType = serializers.ChoiceField(choices=_LLM_CALL_TYPE_CHOICES)
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES)
    model = serializers.CharField()
    estimatedInputTokens = serializers.IntegerField()
    estimatedOutputTokens = serializers.IntegerField()
    estimatedTotalTokens = serializers.IntegerField()
    estimatedCostUsd = serializers.FloatField(required=False, allow_null=True)
    estimatedCostUsdFormatted = serializers.CharField()


class LlmUsageTotalResponseSerializer(serializers.Serializer):
    totalCostUsd = serializers.FloatField()
    totalCostUsdFormatted = serializers.CharField()
