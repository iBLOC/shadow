import 'package:flutter/material.dart';

class GenUIChatWidget extends StatefulWidget {
  final String? initialMessage;
  final Function(String) onSendMessage;
  final Function(String)? onAgentAction;

  const GenUIChatWidget({
    super.key,
    this.initialMessage,
    required this.onSendMessage,
    this.onAgentAction,
  });

  @override
  State<GenUIChatWidget> createState() => _GenUIChatWidgetState();
}

class _GenUIChatWidgetState extends State<GenUIChatWidget> {
  final TextEditingController _controller = TextEditingController();
  final List<ChatMessage> _messages = [];
  bool _isAgentTyping = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialMessage != null) {
      _messages.add(
        ChatMessage(content: widget.initialMessage!, isUser: false),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _messages.add(ChatMessage(content: text, isUser: true));
      _isAgentTyping = true;
    });

    _controller.clear();
    widget.onSendMessage(text);
  }

  void addAgentMessage(String message) {
    setState(() {
      _messages.add(ChatMessage(content: message, isUser: false));
      _isAgentTyping = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            itemCount: _messages.length + (_isAgentTyping ? 1 : 0),
            itemBuilder: (context, index) {
              if (_isAgentTyping && index == _messages.length) {
                return const ChatBubble(
                  content: '...',
                  isUser: false,
                  isTyping: true,
                );
              }
              final message = _messages[index];
              return ChatBubble(
                content: message.content,
                isUser: message.isUser,
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(8.0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    hintText: 'Type a message...',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sendMessage,
                icon: const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class ChatMessage {
  final String content;
  final bool isUser;

  ChatMessage({required this.content, required this.isUser});
}

class ChatBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final bool isTyping;

  const ChatBubble({
    super.key,
    required this.content,
    required this.isUser,
    this.isTyping = false,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
        decoration: BoxDecoration(
          color: isUser
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.secondaryContainer,
          borderRadius: BorderRadius.circular(16),
        ),
        child: isTyping
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Theme.of(context).colorScheme.onSecondaryContainer,
                ),
              )
            : Text(
                content,
                style: TextStyle(
                  color: isUser
                      ? Theme.of(context).colorScheme.onPrimary
                      : Theme.of(context).colorScheme.onSecondaryContainer,
                ),
              ),
      ),
    );
  }
}
