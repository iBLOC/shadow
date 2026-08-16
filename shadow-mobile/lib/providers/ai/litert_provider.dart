import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart';

class LiteRTProvider extends LlmProvider with ChangeNotifier {
  static const _channel = MethodChannel('com.ibloc.shadow/litert');

  final List<ChatMessage> _history = [];

  LiteRTProvider({Iterable<ChatMessage>? history}) {
    if (history != null) {
      _history.addAll(history);
    }
  }

  @override
  Stream<String> generateStream(
    String prompt, {
    Iterable<Attachment> attachments = const [],
  }) async* {
    final content = _buildContent(prompt, attachments);
    yield* _generateStreamInternal(content);
  }

  @override
  Stream<String> sendMessageStream(
    String prompt, {
    Iterable<Attachment> attachments = const [],
  }) async* {
    final userMessage = ChatMessage.user(prompt, attachments);
    final llmMessage = ChatMessage.llm();
    _history.addAll([userMessage, llmMessage]);

    final content = _buildContent(prompt, attachments);

    yield* _generateStreamInternal(content).map((chunk) {
      llmMessage.append(chunk);
      return chunk;
    });

    notifyListeners();
  }

  Stream<String> _generateStreamInternal(Map<String, dynamic> content) async* {
    try {
      await _channel.invokeMethod<bool>('generateContentStream', {
        'content': jsonEncode(content),
      });

      String response = '';
      while (true) {
        await Future.delayed(const Duration(milliseconds: 100));
        final text = await _channel.invokeMethod<String>('getResponseText');
        if (text != null && text.isNotEmpty) {
          final newText = text.substring(response.length);
          if (newText.isNotEmpty) {
            response = text;
            yield newText;
          }
        }

        final isLoading = await _channel.invokeMethod<bool>('isLoading');
        if (isLoading == false) {
          break;
        }
      }
    } catch (e) {
      yield 'Error: $e';
    }
  }

  Map<String, dynamic> _buildContent(
    String prompt,
    Iterable<Attachment> attachments,
  ) {
    final parts = <Map<String, dynamic>>[];

    parts.add({'text': prompt});

    for (final attachment in attachments) {
      switch (attachment) {
        case FileAttachment(:final mimeType, :final bytes):
          if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
            final base64Audio = base64Encode(bytes);
            parts.add({'audio': base64Audio, 'mimeType': mimeType});
          } else if (mimeType.startsWith('image/')) {
            final base64Image = base64Encode(bytes);
            parts.add({'image': base64Image, 'mimeType': mimeType});
          }
        case LinkAttachment(:final url):
          parts.add({'link': url.toString()});
      }
    }

    return {'parts': parts};
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
