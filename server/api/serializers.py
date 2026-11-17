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
    # Absent means every statement; present restricts the rows, and the prior of the walk
    # over the whole graph, to those on screen.
    countedStatementIds = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True, default=None)
    # One party's statements among those: the relevance is read from that party. Absent,
    # there is no relevance.
    startStatementIds = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True, default=None)


class ClauseNeedSerializer(serializers.Serializer):
    # A clause that needs the row's one to be read, and how.
    clauseId = serializers.CharField()
    relation = serializers.ChoiceField(choices=["modified_by", "depends_on", "refers_to"])


class ClauseImportanceResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    documentId = serializers.CharField()
    # The rows' relevance for the party of `startStatementIds`: the walk between clauses that
    # starts on that party's own. Empty without a party.
    byClause = serializers.DictField(child=serializers.FloatField())
    # The clauses that need each row. With a party, only those on its way: why the row has a
    # place by relevance, and a row left out has none.
    neededBy = serializers.DictField(child=ClauseNeedSerializer(many=True))
    byStatement = serializers.DictField(child=serializers.FloatField())
    # The whole fixed point and its restart vector; the graph view draws both.
    byNode = serializers.DictField(child=serializers.FloatField())
    priorByNode = serializers.DictField(child=serializers.FloatField())
    # What that walk leaves on each row's statements: which clauses the contract paints first.
    graphByClause = serializers.DictField(child=serializers.FloatField())
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
    tree = serializers.ListField(child=serializers.DictField(), required=False)


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


# ---------------------------------------------------------------------------
# Contract abstract serializers (mirror schemas/summary.py)
# ---------------------------------------------------------------------------


class ContractSummaryPartySerializer(serializers.Serializer):
    partyId = serializers.CharField(required=False, allow_null=True)
    name = serializers.CharField(allow_blank=True)
    role = serializers.CharField(allow_blank=True)
    does = serializers.CharField(allow_blank=True)


class ContractSummarySerializer(serializers.Serializer):
    documentId = serializers.CharField()
    documentName = serializers.CharField(allow_blank=True)
    title = serializers.CharField(allow_blank=True)
    contractType = serializers.CharField(allow_blank=True)
    summary = serializers.CharField(allow_blank=True)
    parties = ContractSummaryPartySerializer(many=True)


class ContractSummaryRequestSerializer(serializers.Serializer):
    # Without it an existing abstract is returned untouched, so the button
    # cannot burn a call by being clicked twice.
    force = serializers.BooleanField(required=False, default=False)
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES, default="openai")
    model = serializers.CharField(required=False, allow_null=True)


class ContractRiskSerializer(serializers.Serializer):
    statementId = serializers.CharField()
    type = serializers.CharField()
    reason = serializers.CharField(allow_blank=True)


class ContractRisksSerializer(serializers.Serializer):
    documentId = serializers.CharField()
    model = serializers.CharField(allow_blank=True)
    promptVersion = serializers.CharField(allow_blank=True)
    clausesReviewed = serializers.IntegerField()
    clausesFailed = serializers.IntegerField()
    risks = ContractRiskSerializer(many=True)


class ContractRisksRequestSerializer(serializers.Serializer):
    # Without it a contract already reviewed gets its saved answer back and nothing is paid.
    # With it the model is asked again; the saved answer, the first one, is never replaced.
    force = serializers.BooleanField(required=False, default=False)
    provider = serializers.ChoiceField(choices=_ASSISTANT_PROVIDER_CHOICES, default="openai")
    # Absent means the detector's own default model.
    model = serializers.CharField(required=False, allow_null=True)
