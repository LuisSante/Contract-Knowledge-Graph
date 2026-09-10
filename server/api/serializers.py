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


class ProcessElementSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)
    text = serializers.CharField(required=False, allow_blank=True, default="")


class ProcessPageSerializer(serializers.Serializer):
    pageNumber = serializers.IntegerField(required=False, allow_null=True)
    elements = ProcessElementSerializer(many=True, required=False, default=list)


class ClauseImportanceRequestSerializer(serializers.Serializer):
    # Absent means every statement; present restricts the prior to those on screen.
    countedStatementIds = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True, default=None
    )


class ClauseImportanceResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    documentId = serializers.CharField()
    byClause = serializers.DictField(child=serializers.FloatField())
    byStatement = serializers.DictField(child=serializers.FloatField())
    peak = serializers.FloatField()
    iterations = serializers.IntegerField()


class ProcessDocumentRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    pages = ProcessPageSerializer(many=True, required=False, default=list)


class ExtractParagraphsResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    documentId = serializers.CharField()
    enabled = serializers.BooleanField()
    saved = serializers.IntegerField()
    path = serializers.CharField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Phase 2 — Assistant serializers (mirror schemas/assistant.py)
# ---------------------------------------------------------------------------

_ASSISTANT_PROVIDER_CHOICES = ["openai"]
_ASSISTANT_ROLE_CHOICES = ["user", "assistant"]


class AssistantParagraphNodeSerializer(serializers.Serializer):
    id = serializers.CharField()
    text = serializers.CharField(allow_blank=True)
    paragraph_enum = serializers.IntegerField()
    page = serializers.IntegerField()


class AssistantHistoryMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=_ASSISTANT_ROLE_CHOICES)
    content = serializers.CharField(allow_blank=True)


class AssistantChatRequestSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    question = serializers.CharField(allow_blank=True)
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES, default="openai")
    model = serializers.CharField(required=False, allow_null=True)
    selectedParagraphId = serializers.CharField(required=False, allow_null=True)
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
