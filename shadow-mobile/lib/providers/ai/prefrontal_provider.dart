import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart';
import '../../services/prefrontal_client.dart';

class PrefrontalProvider extends LlmProvider with ChangeNotifier {
  final PrefrontalClient _client;
  final List<ChatMessage> _history = [];

  PrefrontalProvider({PrefrontalClient? client, Iterable<ChatMessage>? history})
    : _client = client ?? PrefrontalClient() {
    if (history != null) {
      _history.addAll(history);
    }
  }

  @override
  Stream<String> generateStream(
    String prompt, {
    Iterable<Attachment> attachments = const [],
  }) async* {
    final messages = _buildMessages(prompt, attachments);

    yield* _client.chatCompletionsStream(messages: messages).map((chunk) {
      return chunk;
    });
  }

  @override
  Stream<String> sendMessageStream(
    String prompt, {
    Iterable<Attachment> attachments = const [],
  }) async* {
    final userMessage = ChatMessage.user(prompt, attachments);
    final llmMessage = ChatMessage.llm();
    _history.addAll([userMessage, llmMessage]);

    final messages = _history.map((m) => _chatMessageToMap(m)).toList();

    yield* _client.chatCompletionsStream(messages: messages).map((chunk) {
      llmMessage.append(chunk);
      return chunk;
    });

    notifyListeners();
  }

  List<Map<String, dynamic>> _buildMessages(
    String prompt,
    Iterable<Attachment> attachments,
  ) {
    final messages = <Map<String, dynamic>>[];

    if (attachments.isEmpty) {
      messages.add({'role': 'user', 'content': prompt});
    } else {
      final contentParts = <Map<String, dynamic>>[];

      if (prompt.isNotEmpty) {
        contentParts.add({'type': 'text', 'text': prompt});
      }

      for (final attachment in attachments) {
        switch (attachment) {
          case FileAttachment(:final mimeType, :final bytes):
            final base64Data = base64Encode(bytes);
            if (mimeType.startsWith('image/')) {
              contentParts.add({
                'type': 'image_url',
                'image_url': {'url': 'data:$mimeType;base64,$base64Data'},
              });
            } else if (mimeType.startsWith('audio/')) {
              contentParts.add({
                'type': 'audio',
                'audio': {'url': 'data:$mimeType;base64,$base64Data'},
              });
            }
          case LinkAttachment(:final url):
            contentParts.add({'type': 'text', 'text': 'Link: $url'});
        }
      }

      messages.add({'role': 'user', 'content': contentParts});
    }

    return messages;
  }

  Map<String, dynamic> _chatMessageToMap(ChatMessage msg) {
    return {'role': msg.origin.name, 'content': msg.text ?? ''};
  }

  Future<String?> createSession() async {
    try {
      final session = await _client.createSession();
      return session.id;
    } catch (e) {
      debugPrint('PrefrontalProvider: Failed to create session: $e');
      return null;
    }
  }

  @override
  Iterable<ChatMessage> get history => _history;

  @override
  set history(Iterable<ChatMessage> history) {
    _history.clear();
    _history.addAll(history);
    notifyListeners();
  }
}
