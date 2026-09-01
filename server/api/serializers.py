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
# ---------------------------------------------------------------------------
# Phase 2 — LLM serializers (mirror schemas/llm.py)
# ---------------------------------------------------------------------------

_LLM_CALL_TYPE_CHOICES = ["assistant_chat"]


class LlmEstimateRequestSerializer(serializers.Serializer):
    callType = serializers.ChoiceField(choices=_LLM_CALL_TYPE_CHOICES)
    assistantChat = AssistantChatRequestSerializer(required=False, allow_null=True)


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
