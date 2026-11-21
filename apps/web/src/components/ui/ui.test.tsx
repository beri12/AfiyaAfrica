import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from './field';
import { Input } from './input';
import { StatusBadge } from './badge';
import { Button } from './button';
import { EmptyState, ErrorState } from './states';
import { ApiError } from '@/lib/api';

describe('Field', () => {
  it('associates label, hint and error with the control for screen readers', () => {
    render(
      <Field label="Phone" hint="e.g. 0911 234 567" error="Enter a valid phone number" required>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Phone/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid phone number');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid phone number');
  });

  it('shows the hint when there is no error', () => {
    render(<Field label="Email" hint="Work email"><Input /></Field>);
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Work email');
  });
});

describe('StatusBadge', () => {
  it('humanises statuses', () => {
    render(<StatusBadge status="NO_SHOW" />);
    expect(screen.getByText('No show')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('is disabled and busy while loading', async () => {
    const onClick = jest.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('states', () => {
  it('renders API error messages and a retry action', async () => {
    const retry = jest.fn();
    render(<ErrorState error={new ApiError(403, 'FORBIDDEN', 'You are not a member of this clinic')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('You are not a member of this clinic');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });

  it('renders empty states with actions', () => {
    render(<EmptyState title="No patients yet" description="Register one" action={<button>Add</button>} />);
    expect(screen.getByRole('heading', { name: 'No patients yet' })).toBeInTheDocument();
  });
});
