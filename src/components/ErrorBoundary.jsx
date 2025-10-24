import React from 'react';
import { View, Text, ScrollView } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <ScrollView
        style={{ flex: 1, padding: 16, backgroundColor: '#fff' }}
        contentContainerStyle={{ justifyContent: 'center', alignItems: 'center' }}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#b91c1c', marginBottom: 10 }}>
          Something went wrong 😵
        </Text>
        <Text style={{ color: '#333', textAlign: 'center' }}>
          {this.state.error?.message || String(this.state.error)}
        </Text>
      </ScrollView>
    );
  }
}
