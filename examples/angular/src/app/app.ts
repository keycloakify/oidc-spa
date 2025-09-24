import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { getOidc, get$decodedIdToken } from '../oidc';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  oidc = getOidc();
  $decodedIdToken = get$decodedIdToken();
}
